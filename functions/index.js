const functions = require("firebase-functions");
const admin = require("firebase-admin");
const sgMail = require("@sendgrid/mail");
const crypto = require("crypto");

admin.initializeApp();
const db = admin.firestore();

// ── HELPER: assert caller is admin of a company ──
async function assertAdmin(uid, companyId) {
  const memberRef = db.doc(`companies/${companyId}/members/${uid}`);
  const snap = await memberRef.get();
  if (!snap.exists || snap.data().role !== "admin") {
    throw new functions.https.HttpsError("permission-denied", "You must be a company admin to perform this action.");
  }
}

// ── inviteTeamMember ──
// Looks up email in Firebase Auth. If found, adds directly to company.
// If not found, creates a pendingInvite and sends a SendGrid email.
exports.inviteTeamMember = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }
  const { email, role, companyId } = data;
  if (!email || !role || !companyId) {
    throw new functions.https.HttpsError("invalid-argument", "email, role, and companyId are required.");
  }
  if (!["admin", "edit", "view"].includes(role)) {
    throw new functions.https.HttpsError("invalid-argument", "role must be admin, edit, or view.");
  }

  await assertAdmin(context.auth.uid, companyId);

  // Check if user already exists in Firebase Auth by email
  let targetUid = null;
  try {
    const userRecord = await admin.auth().getUserByEmail(email);
    targetUid = userRecord.uid;
  } catch (e) {
    // User doesn't exist yet — proceed with invite
  }

  if (targetUid) {
    // User exists — add directly
    const batch = db.batch();
    batch.set(db.doc(`companies/${companyId}/members/${targetUid}`), {
      email,
      role,
      addedAt: Date.now(),
    });
    batch.set(db.doc(`users/${targetUid}/config/profile`), {
      companyId,
      role,
    }, { merge: true });
    await batch.commit();
    return { status: "added", email };
  } else {
    // User doesn't exist — create pending invite
    const token = crypto.randomBytes(32).toString("hex");
    await db.doc(`companies/${companyId}/pendingInvites/${token}`).set({
      email,
      role,
      token,
      invitedAt: Date.now(),
      invitedBy: context.auth.uid,
    });

    // Send invite email via SendGrid
    const apiKey = process.env.SENDGRID_API_KEY;
    const appUrl = process.env.APP_URL || "https://matrix-arc.web.app";
    if (apiKey) {
      sgMail.setApiKey(apiKey);
      const inviteUrl = `${appUrl}?invite=${token}`;
      try {
        await sgMail.send({
          to: email,
          from: "noreply@matrix-arc.app",
          subject: "You've been invited to Matrix ARC",
          html: `
            <p>You've been invited to join a Matrix ARC workspace.</p>
            <p>Click the link below to accept your invitation and get started:</p>
            <p><a href="${inviteUrl}" style="background:#3b82f6;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">Accept Invitation</a></p>
            <p>Or copy this link: <a href="${inviteUrl}">${inviteUrl}</a></p>
            <p style="color:#666;font-size:12px;">If you didn't expect this invitation, you can safely ignore this email.</p>
          `,
        });
      } catch (emailErr) {
        console.error("SendGrid error:", emailErr);
        // Don't fail the function if email fails — invite is still created
      }
    } else {
      console.warn("SENDGRID_API_KEY not set — invite created but email not sent.");
    }

    return { status: "invited", email, token };
  }
});

// ── acceptTeamInvite ──
// Finds the pending invite by token, verifies the caller's email matches,
// then adds the caller to the company members and deletes the invite.
exports.acceptTeamInvite = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }
  const { token } = data;
  if (!token) {
    throw new functions.https.HttpsError("invalid-argument", "token is required.");
  }

  // Search all companies for this token
  const inviteQuery = await db.collectionGroup("pendingInvites")
    .where("token", "==", token)
    .limit(1)
    .get();

  if (inviteQuery.empty) {
    throw new functions.https.HttpsError("not-found", "Invite token not found or already used.");
  }

  const inviteDoc = inviteQuery.docs[0];
  const invite = inviteDoc.data();

  // Verify email matches the authenticated user
  const callerEmail = context.auth.token.email;
  if (invite.email.toLowerCase() !== callerEmail.toLowerCase()) {
    throw new functions.https.HttpsError(
      "permission-denied",
      `This invite was sent to ${invite.email}. Sign in with that email to accept.`
    );
  }

  // Extract companyId from path: companies/{companyId}/pendingInvites/{token}
  const companyId = inviteDoc.ref.parent.parent.id;
  const uid = context.auth.uid;

  const batch = db.batch();
  batch.set(db.doc(`companies/${companyId}/members/${uid}`), {
    email: callerEmail,
    role: invite.role,
    addedAt: Date.now(),
  });
  batch.set(db.doc(`users/${uid}/config/profile`), {
    companyId,
    role: invite.role,
  }, { merge: true });
  batch.delete(inviteDoc.ref);
  await batch.commit();

  return { status: "accepted", companyId, role: invite.role };
});

// ── removeTeamMember ──
// Admin only. Removes member from company and clears their profile.
exports.removeTeamMember = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }
  const { targetUid, companyId } = data;
  if (!targetUid || !companyId) {
    throw new functions.https.HttpsError("invalid-argument", "targetUid and companyId are required.");
  }

  await assertAdmin(context.auth.uid, companyId);

  if (targetUid === context.auth.uid) {
    throw new functions.https.HttpsError("invalid-argument", "You cannot remove yourself.");
  }

  const batch = db.batch();
  batch.delete(db.doc(`companies/${companyId}/members/${targetUid}`));
  batch.set(db.doc(`users/${targetUid}/config/profile`), {
    companyId: null,
    role: null,
  }, { merge: true });
  await batch.commit();

  return { status: "removed", targetUid };
});

// ── updateMemberRole ──
// Admin only. Updates a member's role in both the company and their profile.
exports.updateMemberRole = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }
  const { targetUid, role, companyId } = data;
  if (!targetUid || !role || !companyId) {
    throw new functions.https.HttpsError("invalid-argument", "targetUid, role, and companyId are required.");
  }
  if (!["admin", "edit", "view"].includes(role)) {
    throw new functions.https.HttpsError("invalid-argument", "role must be admin, edit, or view.");
  }

  await assertAdmin(context.auth.uid, companyId);

  if (targetUid === context.auth.uid) {
    throw new functions.https.HttpsError("invalid-argument", "You cannot change your own role.");
  }

  const batch = db.batch();
  batch.update(db.doc(`companies/${companyId}/members/${targetUid}`), { role });
  batch.set(db.doc(`users/${targetUid}/config/profile`), { role }, { merge: true });
  await batch.commit();

  return { status: "updated", targetUid, role };
});

// ── sendInviteEmail ──
// Sends an invite email with the join URL. Caller must be authenticated.
exports.sendInviteEmail = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }
  const { to, inviteUrl, role } = data;
  if (!to || !inviteUrl) {
    throw new functions.https.HttpsError("invalid-argument", "to and inviteUrl are required.");
  }

  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    throw new functions.https.HttpsError("failed-precondition", "Email sending is not configured.");
  }

  sgMail.setApiKey(apiKey);
  await sgMail.send({
    to,
    from: { email: "sales@matrixpci.com", name: "Matrix ARC" },
    subject: "You've been invited to Matrix ARC",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <div style="font-size:28px;font-weight:800;margin-bottom:4px">⬡ Matrix <span style="color:#3b82f6">ARC</span></div>
        <div style="color:#6b7280;font-size:13px;margin-bottom:32px">AI Recognition &amp; Capture · Control Panel Quoting</div>
        <p style="font-size:15px;color:#111;line-height:1.6">You've been invited to join a <strong>Matrix ARC</strong> workspace as a <strong>${role}</strong>.</p>
        <p style="margin:24px 0">
          <a href="${inviteUrl}" style="background:#3b82f6;color:#fff;padding:13px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">Accept Invitation</a>
        </p>
        <p style="font-size:13px;color:#6b7280">Or copy this link:<br><a href="${inviteUrl}" style="color:#3b82f6;word-break:break-all">${inviteUrl}</a></p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0"/>
        <p style="font-size:12px;color:#9ca3af">If you didn't expect this invitation, you can safely ignore this email.</p>
      </div>
    `,
  });

  return { status: "sent", to };
});

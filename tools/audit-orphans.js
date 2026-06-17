#!/usr/bin/env node
/*
 * tools/audit-orphans.js — READ-ONLY audit for orphaned user profiles.
 *
 * Finds users whose users/{uid}/config/profile carries a non-null companyId but who have
 * NO companies/{companyId}/members/{uid} member doc — the orphaned-profile state that causes
 * the home-load spin-trap (#143) and is created by the pre-#144 removeTeamMember (#144).
 *
 * Per Coach supplement #144 Q4. This is a cross-collection join (not a single Firestore
 * query), so it iterates every profile and checks member-doc existence.
 *
 * SAFETY: read-only. NO writes, NO deletes. Reports a count + affected UIDs/emails only.
 * Cleanup decisions (if count > 0) are the admin's — use tools/reset-user.js per-user.
 *
 * Usage:  node tools/audit-orphans.js
 * Credentials: Application Default Credentials (gcloud auth application-default login).
 * Project: matrix-arc.
 */

const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));

admin.initializeApp({ projectId: 'matrix-arc', credential: admin.credential.applicationDefault() });
const db = admin.firestore();
const auth = admin.auth();

const C = { reset: '\x1b[0m', red: '\x1b[31m', grn: '\x1b[32m', yel: '\x1b[33m', cyan: '\x1b[36m', dim: '\x1b[2m', bold: '\x1b[1m' };
const log = (s = '') => console.log(s);

(async () => {
  log(`${C.bold}=== ORPHANED-PROFILE AUDIT ${C.grn}[READ-ONLY]${C.reset}${C.bold} ===${C.reset}`);
  log(`Project: matrix-arc`);
  log(`${C.dim}A profile is "orphaned" if it has a companyId but no matching members/{uid} doc.${C.reset}\n`);

  // All user doc refs (listDocuments returns refs even when the parent doc has no fields
  // but has subcollections like config/).
  const userRefs = await db.collection('users').listDocuments();
  let scanned = 0, withCompany = 0;
  const orphans = [];
  const memberExistsCache = new Map(); // `${cid}/${uid}` -> bool (kept simple; uids are unique anyway)

  for (const uref of userRefs) {
    const uid = uref.id;
    let prof;
    try { prof = await uref.collection('config').doc('profile').get(); }
    catch (e) { log(`${C.yel}  (skip ${uid}: profile read failed — ${e.code || e.message})${C.reset}`); continue; }
    if (!prof.exists) continue;
    scanned++;
    const data = prof.data() || {};
    const cid = data.companyId;
    if (!cid) continue; // null/absent companyId → personal/solo path, not an orphan
    withCompany++;
    const mref = db.doc(`companies/${cid}/members/${uid}`);
    const member = await mref.get();
    if (!member.exists) {
      // Orphan. Resolve email/name for the report (best-effort).
      let email = '(unknown)';
      try { email = (await auth.getUser(uid)).email || '(no email)'; } catch (_) { email = '(no auth user)'; }
      orphans.push({ uid, companyId: cid, role: data.role || '(none)', firstName: data.firstName || '', email });
    }
  }

  log(`Profiles scanned (exist):           ${scanned}`);
  log(`Profiles with a companyId:          ${withCompany}`);
  log(`${C.bold}Orphaned profiles (companyId, no member doc): ${orphans.length ? C.red : C.grn}${orphans.length}${C.reset}\n`);

  if (orphans.length) {
    log(`${C.bold}AFFECTED:${C.reset}`);
    orphans.forEach(o => log(`  ${C.red}ORPHAN${C.reset} uid=${o.uid}  email=${o.email}  companyId=${o.companyId}  role=${o.role}  firstName=${o.firstName || '(none)'}`));
    log(`\n${C.dim}These users will hit the boot spin-trap (pre-#143) / the inline "contact admin" error (post-#143)`);
    log(`until cleared. Cleanup is an admin decision — use tools/reset-user.js per-user, or re-invite.${C.reset}`);
  } else {
    log(`${C.grn}No orphaned profiles found.${C.reset}`);
  }
})().then(() => process.exit(0)).catch(e => { console.error(`${C.red}FATAL:${C.reset}`, e); process.exit(1); });

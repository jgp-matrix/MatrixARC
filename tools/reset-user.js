#!/usr/bin/env node
/*
 * tools/reset-user.js — one-off admin USER RESET (single user, parameterized by email).
 *
 * Purpose: clear the "orphaned-profile spin-trap" state where a user has a
 *   users/{uid}/config/profile (with companyId) but NO companies/{cid}/members/{uid}
 *   member doc, which causes the home-load projects read to be permission-denied and
 *   the "Loading Projects" spinner to hang forever (un-try/caught await in app boot).
 *
 * What it targets (and ONLY these):
 *   1. Firebase Auth user for the email
 *   2. users/{uid}/config/profile          <- the doc removeTeamMember never clears
 *   3. companies/{cid}/members/{uid}        <- cid resolved from the profile (likely already absent)
 *   4. companies/{cid}/pendingInvites/*     <- any invite whose email matches (lowercased)
 *
 * SAFETY:
 *   - DRY-RUN BY DEFAULT. Prints exactly what it WOULD delete and STOPS.
 *   - Pass --apply to actually delete. Deletions are irreversible.
 *   - Idempotent / not-found-safe on every delete.
 *   - Read-only on everything else. Touches no other user/company/project.
 *   - Does NOT delete other users/{uid}/config/* docs (e.g. config/api) — only config/profile,
 *     per spec. Any such siblings are reported (for visibility) but left in place.
 *
 * Usage:
 *   node tools/reset-user.js --email ryan@matrixpci.com            # dry-run (default)
 *   node tools/reset-user.js --email ryan@matrixpci.com --apply    # destructive
 *   [--company <cid>]  optional: also check this company for member/invite docs
 *
 * Credentials: uses Application Default Credentials (gcloud auth application-default login).
 * Project: matrix-arc.
 */

const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));

// ---- args ----
const argv = process.argv.slice(2);
function argVal(name) { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; }
const APPLY = argv.includes('--apply');
const EMAIL_RAW = argVal('--email') || 'ryan@matrixpci.com';
const EMAIL = EMAIL_RAW.toLowerCase().trim();
const EXTRA_COMPANY = argVal('--company'); // optional extra company to sweep

const PROJECT_ID = 'matrix-arc';

admin.initializeApp({ projectId: PROJECT_ID, credential: admin.credential.applicationDefault() });
const db = admin.firestore();
const auth = admin.auth();

const C = { reset: '\x1b[0m', red: '\x1b[31m', grn: '\x1b[32m', yel: '\x1b[33m', cyan: '\x1b[36m', dim: '\x1b[2m', bold: '\x1b[1m' };
function log(s = '') { console.log(s); }
function head(s) { log(`\n${C.bold}${C.cyan}${s}${C.reset}`); }

(async () => {
  log(`${C.bold}=== USER RESET ${APPLY ? `${C.red}[APPLY — DESTRUCTIVE]` : `${C.grn}[DRY-RUN]`}${C.reset}${C.bold} ===${C.reset}`);
  log(`Project : ${PROJECT_ID}`);
  log(`Email   : ${EMAIL}`);
  log(`Mode    : ${APPLY ? 'APPLY (will delete)' : 'DRY-RUN (no deletes; pass --apply to delete)'}`);

  // Plan of record: each item gets {label, exists, path|uid, action}
  const plan = [];

  // ---- 1. Resolve Auth user ----
  head('1. Firebase Auth user');
  let authUser = null;
  try {
    authUser = await auth.getUserByEmail(EMAIL);
    log(`  FOUND  uid=${authUser.uid}  created=${authUser.metadata.creationTime}  lastSignIn=${authUser.metadata.lastSignInTime || '(never)'}`);
    plan.push({ label: 'Auth user', kind: 'auth', target: authUser.uid, exists: true });
  } catch (e) {
    if (e.code === 'auth/user-not-found') {
      log(`  ${C.yel}ABSENT — no Auth user for ${EMAIL}${C.reset}`);
      log(`  ${C.dim}(continuing to Firestore checks; a stale profile can outlive the Auth user)${C.reset}`);
      plan.push({ label: 'Auth user', kind: 'auth', target: null, exists: false });
    } else {
      log(`  ${C.red}ERROR resolving Auth user: ${e.code || ''} ${e.message}${C.reset}`);
      throw e;
    }
  }
  const uid = authUser ? authUser.uid : null;

  // ---- 2. Profile doc ----
  head('2. Profile doc  users/{uid}/config/profile');
  let profile = null, cid = null;
  if (!uid) {
    log(`  ${C.yel}SKIPPED — no uid (Auth user absent); cannot locate the profile by uid.${C.reset}`);
    log(`  ${C.dim}If you know the orphaned uid, re-run with it once resolvable.${C.reset}`);
  } else {
    const profSnap = await db.doc(`users/${uid}/config/profile`).get();
    if (profSnap.exists) {
      profile = profSnap.data();
      cid = profile.companyId || null;
      log(`  EXISTS  users/${uid}/config/profile`);
      log(`  data: ${JSON.stringify(profile)}`);
      log(`  -> companyId (cid): ${cid || '(none)'}`);
      plan.push({ label: 'Profile doc', kind: 'doc', target: `users/${uid}/config/profile`, exists: true });
    } else {
      log(`  ${C.yel}ABSENT — users/${uid}/config/profile does not exist${C.reset}`);
      plan.push({ label: 'Profile doc', kind: 'doc', target: `users/${uid}/config/profile`, exists: false });
    }
    // visibility only — list sibling config docs that will become orphaned but are NOT deleted
    try {
      const sib = await db.collection(`users/${uid}/config`).listDocuments();
      const others = sib.map(d => d.id).filter(id => id !== 'profile');
      if (others.length) log(`  ${C.dim}(other users/${uid}/config/* docs present, NOT deleted per spec: ${others.join(', ')})${C.reset}`);
    } catch (_) { /* listDocuments may be unavailable; non-fatal */ }
  }

  // ---- 3. Member doc ----
  head('3. Member doc  companies/{cid}/members/{uid}');
  const memberTargets = [];
  if (cid) memberTargets.push(cid);
  if (EXTRA_COMPANY && EXTRA_COMPANY !== cid) memberTargets.push(EXTRA_COMPANY);
  if (!uid) {
    log(`  ${C.yel}SKIPPED — no uid.${C.reset}`);
  } else if (!memberTargets.length) {
    log(`  ${C.yel}No company to check (profile has no companyId, no --company given).${C.reset}`);
  } else {
    for (const c of memberTargets) {
      const mSnap = await db.doc(`companies/${c}/members/${uid}`).get();
      if (mSnap.exists) {
        log(`  EXISTS  companies/${c}/members/${uid}  data: ${JSON.stringify(mSnap.data())}`);
        plan.push({ label: 'Member doc', kind: 'doc', target: `companies/${c}/members/${uid}`, exists: true });
      } else {
        log(`  ${C.yel}ABSENT — companies/${c}/members/${uid} (expected — this is the orphan condition)${C.reset}`);
        plan.push({ label: 'Member doc', kind: 'doc', target: `companies/${c}/members/${uid}`, exists: false });
      }
    }
  }

  // ---- 4. Pending invites (by email) ----
  head('4. Pending invites  companies/*/pendingInvites where email == ' + EMAIL);
  const inviteRefs = [];
  let usedFallback = false;
  try {
    const cg = await db.collectionGroup('pendingInvites').where('email', '==', EMAIL).get();
    cg.forEach(d => inviteRefs.push(d.ref));
  } catch (e) {
    usedFallback = true;
    log(`  ${C.dim}collectionGroup query unavailable (${e.code || e.message}); falling back to per-company scan${C.reset}`);
    const companies = await db.collection('companies').get();
    for (const co of companies.docs) {
      const inv = await db.collection(`companies/${co.id}/pendingInvites`).where('email', '==', EMAIL).get();
      inv.forEach(d => inviteRefs.push(d.ref));
    }
  }
  if (inviteRefs.length) {
    inviteRefs.forEach(r => {
      log(`  EXISTS  ${r.path}`);
      plan.push({ label: 'Pending invite', kind: 'doc', target: r.path, exists: true, ref: r });
    });
  } else {
    log(`  ${C.yel}ABSENT — no pendingInvites for ${EMAIL}${usedFallback ? ' (scanned all companies)' : ''}${C.reset}`);
  }

  // ---- Summary / plan ----
  head('PLAN' + (APPLY ? ' — EXECUTING' : ' — would delete (dry-run)'));
  const toDelete = plan.filter(p => p.exists);
  if (!toDelete.length) {
    log(`  ${C.grn}Nothing to delete — account is already clean for ${EMAIL}.${C.reset}`);
  } else {
    toDelete.forEach(p => log(`  ${APPLY ? C.red + 'DELETE' : C.yel + 'WOULD DELETE'}${C.reset} ${p.label}: ${p.kind === 'auth' ? 'Auth uid ' + p.target : p.target}`));
  }
  plan.filter(p => !p.exists).forEach(p => log(`  ${C.dim}skip (already absent): ${p.label}${C.reset}`));

  if (!APPLY) {
    log(`\n${C.bold}${C.grn}DRY-RUN complete. Nothing was deleted.${C.reset}`);
    log(`Re-run with ${C.bold}--apply${C.reset} to execute the deletions above.`);
    return;
  }

  // ---- APPLY: execute deletes (idempotent / not-found-safe) ----
  head('APPLYING DELETES');
  const results = [];
  // Auth user
  if (uid) {
    try { await auth.deleteUser(uid); results.push(`${C.grn}deleted${C.reset} Auth user uid=${uid}`); }
    catch (e) {
      if (e.code === 'auth/user-not-found') results.push(`${C.dim}already absent${C.reset} Auth user uid=${uid}`);
      else results.push(`${C.red}FAILED${C.reset} Auth user uid=${uid}: ${e.message}`);
    }
  }
  // Firestore doc deletes (delete() is a no-op on missing docs — idempotent)
  const docPaths = [];
  if (uid) docPaths.push(`users/${uid}/config/profile`);
  for (const c of memberTargets) if (uid) docPaths.push(`companies/${c}/members/${uid}`);
  for (const p of docPaths) {
    try {
      const existedBefore = (await db.doc(p).get()).exists;
      await db.doc(p).delete();
      results.push(`${existedBefore ? C.grn + 'deleted' : C.dim + 'already absent'}${C.reset} ${p}`);
    } catch (e) { results.push(`${C.red}FAILED${C.reset} ${p}: ${e.message}`); }
  }
  // Pending invites
  for (const r of inviteRefs) {
    try { await r.delete(); results.push(`${C.grn}deleted${C.reset} ${r.path}`); }
    catch (e) { results.push(`${C.red}FAILED${C.reset} ${r.path}: ${e.message}`); }
  }

  head('AFTER REPORT');
  results.forEach(s => log('  ' + s));
  log(`\n${C.bold}${C.grn}Reset complete for ${EMAIL}.${C.reset}`);
  log(`${C.dim}Next: send a fresh team invite; Ryan accepts via the link BEFORE opening the app.${C.reset}`);
})().then(() => process.exit(0)).catch(e => { console.error(`${C.red}FATAL:${C.reset}`, e); process.exit(1); });

// ─── Supplier Quote Import ──────────────────────────────────────────────────
// Extracted from monolith index.html lines ~3738-3889.
// Handles supplier quote validation, Firestore persistence, crossings,
// vendor mapping, fuzzy matching, and audit logging.

import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

declare const require: any;
let _globals: any = null;
function globals() { if (!_globals) _globals = require('@/core/globals'); return _globals; }
function fbDb(): firebase.firestore.Firestore { return globals().fbDb; }

// ── Internal Helpers ────────────────────────────────────────────────────────

const SQ_NOTES = [
  { p: /CANCEL/i, n: 'CANCEL ON ORDER' }, { p: /NEVER ORDERED/i, n: 'NEVER ORDERED' },
  { p: /NOT SUPPLY/i, n: 'NOT SUPPLYING' }, { p: /IN HOUSE/i, n: 'MAKE IN HOUSE' },
  { p: /TBD/i, n: 'TBD' }, { p: /ON HOLD/i, n: 'ON HOLD' },
];

/**
 * Extract manufacturer prefix from a raw part number string.
 * If the first word is 2-6 uppercase alpha chars, treat as MFR code.
 */
export function sqExtractMfr(raw: any): { mfr: string; partNumber: string } {
  if (!raw || typeof raw !== 'string') return { mfr: '', partNumber: raw || '' };
  const t = raw.trim(), parts = t.split(' '), p = parts[0] || '';
  if (/^[A-Za-z]{2,6}$/.test(p)) return { mfr: p.toUpperCase(), partNumber: parts.slice(1).join(' ').trim() };
  return { mfr: '', partNumber: t };
}

/**
 * Normalize a raw supplier quote line item into standardized format.
 */
export function sqNormalize(raw: any): any {
  const { mfr, partNumber } = sqExtractMfr(raw.rawPartNumber || '');
  const isPriced = raw.qty != null && raw.price != null && !isNaN(raw.qty) && !isNaN(raw.price);
  let notes = ''; for (const { p, n } of SQ_NOTES) { if (p.test(raw.description || '')) { notes = n; break; } }
  return {
    ln: raw.ln ?? null, mfr, partNumber, rawPartNumber: raw.rawPartNumber || '', description: raw.description || '',
    qty: isPriced ? Number(raw.qty) : null, price: isPriced ? Number(raw.price) : null, uom: raw.uom || '',
    extPrice: isPriced ? Math.round(raw.qty * raw.price * 100) / 100 : null, notes, isPriced,
    extractionWarning: raw.extractionWarning || null,
    bcItemId: null, bcItemDescription: null, bcCurrentCost: null, matchStatus: 'unmatched', priceUpdateStatus: null, approved: true,
  };
}

// ── Exported Functions ──────────────────────────────────────────────────────

/**
 * Validates supplier quote line items -- checks for duplicate line numbers and part numbers.
 */
export function sqValidateLineItems(items: any[]): {
  dupeLines: any[]; dupeParts: any[]; missingLn: number; hasIssues: boolean;
} {
  const dupeLines: any[] = [], dupeParts: any[] = [];
  const lnMap: Record<string, number[]> = {}, pnMap: Record<string, number[]> = {};
  items.forEach((item: any, i: number) => {
    if (item.ln != null) { const k = String(item.ln); (lnMap[k] = lnMap[k] || []).push(i); }
    if (item.rawPartNumber) { const k = (item.rawPartNumber || '').toLowerCase().trim(); (pnMap[k] = pnMap[k] || []).push(i); }
  });
  Object.entries(lnMap).filter(([, a]) => a.length > 1).forEach(([ln, idxs]) => dupeLines.push({ ln: Number(ln), rows: idxs }));
  Object.entries(pnMap).filter(([, a]) => a.length > 1).forEach(([, idxs]) => dupeParts.push({ pn: items[idxs[0]].rawPartNumber, rows: idxs }));
  const missingLn = items.filter((item: any) => item.ln == null).length;
  return { dupeLines, dupeParts, missingLn, hasIssues: dupeLines.length > 0 || dupeParts.length > 0 };
}

/**
 * Saves a supplier quote submission to Firestore with normalization and search indexing.
 */
export async function saveSupplierQuoteToFirestore(
  quoteData: any,
  userId: string,
  { supersedes = null, projectId = null, bcProjectNumber = null }: { supersedes?: string | null; projectId?: string | null; bcProjectNumber?: string | null } = {}
): Promise<{ docId: string; lineItems: any[] }> {
  const db = fbDb();
  const ref = db.collection('supplierQuotes').doc();
  const lineItems = (quoteData.lineItems || []).map(sqNormalize);
  const total = lineItems.reduce((s: number, i: any) => s + (i.extPrice || 0), 0);
  // Build search tokens for array-contains queries
  const tokenize = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w: string) => w.length > 1);
  const searchTokens = [...new Set([
    ...tokenize(quoteData.supplier),
    ...tokenize(quoteData.quoteId),
    ...tokenize(quoteData.jobName),
    ...tokenize(quoteData.contactName),
  ])];
  await ref.set({
    quoteId: quoteData.quoteId || '', revision: quoteData.revision || '', supplier: quoteData.supplier || '',
    supplierLower: (quoteData.supplier || '').toLowerCase(),
    jobName: quoteData.jobName || '', contactName: quoteData.contactName || '', quoteDate: quoteData.quoteDate || null,
    expiresOn: quoteData.expiresOn || null, fob: quoteData.fob || '', freight: quoteData.freight || '',
    status: 'pending_review', merchandiseTotal: Math.round(total * 100) / 100, lineItems, searchTokens,
    pdfUrl: null, fileName: '', supersedes: supersedes || null, supersededBy: null,
    projectId: projectId || null, bcProjectNumber: bcProjectNumber || null,
    importedAt: firebase.firestore.FieldValue.serverTimestamp(), importedBy: userId,
  });
  if (supersedes) {
    db.collection('supplierQuotes').doc(supersedes)
      .update({ supersededBy: ref.id, status: 'superseded' }).catch(() => {});
  }
  return { docId: ref.id, lineItems };
}

/**
 * Get adaptive AI parse time prior from Firestore (rolling average + 15% buffer).
 */
export async function sqGetAiPrior(uid: string): Promise<number> {
  try {
    const snap = await fbDb().collection('users').doc(uid).collection('config').doc('sqLearning').get();
    if (!snap.exists) return 22;
    const arr = (snap.data() as any).aiParseTimes || [];
    if (!arr.length) return 22;
    const recent = arr.slice(-8);
    const avg = recent.reduce((a: number, b: number) => a + b, 0) / recent.length;
    return Math.max(10, Math.round(avg * 1.15));
  } catch { return 22; }
}

/**
 * Record an AI parse time measurement to Firestore (keeps last 10).
 */
export async function sqRecordAiTime(uid: string, seconds: number): Promise<void> {
  try {
    const ref = fbDb().collection('users').doc(uid).collection('config').doc('sqLearning');
    const snap = await ref.get();
    const arr = snap.exists ? ((snap.data() as any).aiParseTimes || []) : [];
    arr.push(Math.round(seconds));
    await ref.set({ aiParseTimes: arr.slice(-10) }, { merge: true });
  } catch (e) { console.warn('sqRecordAiTime:', e); }
}

/**
 * Load supplier-PN -> BC-item crossings from Firestore.
 */
export async function sqGetCrossings(uid: string): Promise<any> {
  try {
    const snap = await fbDb().doc(`users/${uid}/config/sqCrossings`).get();
    return snap.exists ? snap.data() : {};
  } catch (e) { return {}; }
}

/**
 * Save a supplier-PN -> BC-item crossing.
 */
export async function sqSaveCrossing(uid: string, supplierPN: string, bcItem: any): Promise<void> {
  const key = supplierPN.toLowerCase().trim();
  await fbDb().doc(`users/${uid}/config/sqCrossings`).set(
    { [key]: { bcItemId: bcItem.id || null, bcItemNumber: bcItem.number || '', bcItemDescription: bcItem.displayName || '', bcUnitCost: bcItem.unitCost ?? null } },
    { merge: true });
}

/**
 * Load supplier -> vendor number mappings from Firestore.
 */
export async function sqGetVendorMap(uid: string): Promise<any> {
  try {
    const snap = await fbDb().collection('users').doc(uid).collection('config').doc('supplierVendorMap').get();
    return snap.exists ? snap.data() : {};
  } catch { return {}; }
}

/**
 * Save a supplier-name -> vendor-number mapping.
 */
export async function sqSaveVendorMapping(uid: string, supplierName: string, vendorNo: string): Promise<void> {
  try {
    const key = supplierName.toLowerCase().trim();
    await fbDb().collection('users').doc(uid).collection('config').doc('supplierVendorMap').set({ [key]: vendorNo }, { merge: true });
  } catch (e) { console.warn('sqSaveVendorMapping:', e); }
}

/**
 * Record an audit entry for BC price push operations.
 */
export async function sqSavePushAudit(quoteDocId: string, supplier: string, quoteId: string, userId: string, auditItems: any[]): Promise<void> {
  if (!auditItems.length) return;
  await fbDb().collection('bcPriceUpdates').add({
    quoteId, supplier, quoteDocId,
    pushedAt: firebase.firestore.FieldValue.serverTimestamp(), pushedBy: userId, items: auditItems,
  });
}

/**
 * Fuzzy match a supplier name to a BC vendor list.
 * First word match gets a strong 0.6 base boost; threshold is 0.25.
 */
export function sqFuzzyMatchVendor(supplierName: string, vendors: any[]): any {
  if (!supplierName || !vendors.length) return null;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\b(inc|llc|ltd|corp|co|company|the|and)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const srcWords = norm(supplierName).split(' ').filter((w: string) => w.length > 1);
  if (!srcWords.length) return null;
  const srcFirst = srcWords[0];
  let best: any = null, bestScore = 0;
  for (const v of vendors) {
    const vWords = norm(v.displayName).split(' ').filter((w: string) => w.length > 1);
    if (!vWords.length) continue;
    const firstMatch = srcFirst && vWords[0] === srcFirst;
    const overlapMatched = srcWords.filter((sw: string) => vWords.some((vw: string) => vw === sw || vw.includes(sw) || sw.includes(vw)));
    const overlapScore = overlapMatched.length / Math.max(srcWords.length, vWords.length);
    const score = firstMatch ? Math.max(0.6 + overlapScore * 0.4, overlapScore) : overlapScore;
    if (score > bestScore) { bestScore = score; best = v; }
  }
  return bestScore >= 0.25 ? best : null;
}

// ─── Part Library ────────────────────────────────────────────────────────────
// Fuzzy matching, corrections, and part library management.

import type { BomRow, PartLibraryEntry, PartCorrection, AlternatePart } from '@/core/types';
import { normPart } from './deduplicator';

// Lazy accessors — avoids importing globals.ts at module load (which calls firebase.auth() and breaks tests)
declare const require: any;
let _globals: any = null;
function globals() {
  if (!_globals) _globals = require('@/core/globals');
  return _globals;
}
function fbDb() { return globals().fbDb; }
function appCtx() { return globals()._appCtx; }

/**
 * Find a part suggestion from the library for a BOM row.
 * Returns the suggested part number or null.
 */
export function findPartSuggestion(
  library: PartLibraryEntry[],
  row: BomRow
): string | null {
  if (!library?.length || !row.manufacturer || !row.description) return null;

  const mfr = (row.manufacturer || '').trim().toLowerCase();
  const desc = (row.description || '').trim().toLowerCase();
  const key = `${mfr}||${desc}`;

  // Exact match by key
  const exact = library.find(e => e.key === key);
  if (exact && exact.partNumber !== row.partNumber) return exact.partNumber;

  // Fuzzy match: same manufacturer, similar description
  for (const entry of library) {
    if (!entry.manufacturer || !entry.description) continue;
    const eMfr = entry.manufacturer.trim().toLowerCase();
    const eDesc = entry.description.trim().toLowerCase();
    if (eMfr !== mfr) continue;

    // Check if descriptions match with minor differences
    if (eDesc === desc && entry.partNumber !== row.partNumber) {
      return entry.partNumber;
    }
  }

  return null;
}

/**
 * Apply known part corrections to a BOM.
 * Returns updated BOM with corrections applied.
 */
export function applyPartCorrections(corrections: PartCorrection[], bom: BomRow[]): BomRow[] {
  if (!corrections?.length) return bom;

  const corrMap = new Map<string, string>();
  for (const c of corrections) {
    corrMap.set(normPart(c.badPN), c.correctedPN);
  }

  return bom.map(row => {
    const norm = normPart(row.partNumber);
    const corrected = corrMap.get(norm);
    if (corrected && corrected !== row.partNumber) {
      return { ...row, partNumber: corrected, autoReplaced: true };
    }
    return row;
  });
}

// ─── Alternates Database ────────────────────────────────────────────────────

let _altCache: AlternatePart[] | null = null;

function _altPath(uid: string): string {
  return (appCtx().configPath || `users/${uid}/config`) + '/alternates';
}

/**
 * Load alternate parts from Firestore.
 */
export async function loadAlternates(uid: string): Promise<AlternatePart[]> {
  if (_altCache) return _altCache;
  try {
    const d = await fbDb().doc(_altPath(uid)).get();
    _altCache = d.exists ? ((d.data() as any).alternates || []) : [];
  } catch {
    _altCache = [];
  }
  return _altCache!;
}

/**
 * Save an alternate part entry to Firestore.
 */
export async function saveAlternateEntry(
  uid: string,
  originalPN: string,
  replacement: any,
  autoReplace = false
): Promise<AlternatePart[]> {
  const alts = await loadAlternates(uid);
  const idx = alts.findIndex(a => a.originalPN === originalPN);
  if (idx >= 0) {
    alts[idx] = { ...alts[idx], replacement, autoReplace: autoReplace || alts[idx].autoReplace, updatedAt: Date.now() };
  } else {
    alts.push({ originalPN, replacement, autoReplace, createdAt: Date.now() });
  }
  _altCache = [...alts];
  await fbDb().doc(_altPath(uid)).set({ alternates: _altCache });
  return _altCache;
}

/**
 * Toggle auto-replace for an alternate part.
 */
export async function setAltAutoReplace(
  uid: string,
  originalPN: string,
  autoReplace: boolean
): Promise<AlternatePart[]> {
  const alts = await loadAlternates(uid);
  const idx = alts.findIndex(a => a.originalPN === originalPN);
  if (idx >= 0) {
    alts[idx] = { ...alts[idx], autoReplace };
  }
  _altCache = [...alts];
  await fbDb().doc(_altPath(uid)).set({ alternates: _altCache });
  return _altCache;
}

// ─── Corrections Database ───────────────────────────────────────────────────

let _correctionsCache: PartCorrection[] | null = null;

function _correctionsPath(uid: string): string {
  return (appCtx().configPath || `users/${uid}/config`) + '/corrections';
}

/**
 * Load correction database from Firestore.
 */
export async function loadCorrectionDB(uid: string): Promise<PartCorrection[]> {
  if (_correctionsCache) return _correctionsCache;
  try {
    const d = await fbDb().doc(_correctionsPath(uid)).get();
    _correctionsCache = d.exists ? ((d.data() as any).corrections || []) : [];
  } catch {
    _correctionsCache = [];
  }
  return _correctionsCache!;
}

/**
 * Guess the correction type based on comparing original and new part numbers.
 * Returns 'format' if same chars different formatting, 'extraction' if very different.
 */
// ─── Page Type Learning Database ──────────────────────────────────────────────

let _pageTypeLearningCache: any[] | null = null;

function _ptlPath(uid: string): string {
  return (appCtx().configPath || `users/${uid}/config`) + '/page_type_learning';
}

/**
 * Load page type learning examples from Firestore.
 */
export async function loadPageTypeLearning(uid: string): Promise<any[]> {
  if (_pageTypeLearningCache) return _pageTypeLearningCache;
  try {
    const d = await fbDb().doc(_ptlPath(uid)).get();
    _pageTypeLearningCache = d.exists ? (d.data().examples || []) : [];
  } catch {
    _pageTypeLearningCache = [];
  }
  return _pageTypeLearningCache!;
}

/**
 * Save a page type learning entry to Firestore.
 */
export async function savePageTypeLearningEntry(uid: string, entry: any): Promise<void> {
  const examples = await loadPageTypeLearning(uid);
  examples.push({ ...entry, savedAt: Date.now() });
  _pageTypeLearningCache = examples;
  await fbDb().doc(_ptlPath(uid)).set({ examples }).catch(() => {});
}

// ─── Layout Learning Database ────────────────────────────────────────────────

let _layoutLearningCache: any[] | null = null;

function _llPath(uid: string): string {
  return (appCtx().configPath || `users/${uid}/config`) + '/layout_learning';
}

/**
 * Load layout learning entries from Firestore.
 */
export async function loadLayoutLearning(uid: string): Promise<any[]> {
  if (_layoutLearningCache) return _layoutLearningCache;
  try {
    const d = await fbDb().doc(_llPath(uid)).get();
    _layoutLearningCache = d.exists ? (d.data().entries || []) : [];
  } catch {
    _layoutLearningCache = [];
  }
  return _layoutLearningCache!;
}

/**
 * Save a layout learning entry to Firestore.
 */
export async function saveLayoutLearningEntry(uid: string, entry: any): Promise<void> {
  const entries = await loadLayoutLearning(uid);
  entries.push({ ...entry, savedAt: Date.now() });
  _layoutLearningCache = entries;
  await fbDb().doc(_llPath(uid)).set({ entries }).catch(() => {});
}

// ─── Save Correction Entry ───────────────────────────────────────────────────

/**
 * Save a part number correction entry to the corrections database.
 */
export async function saveCorrectionEntry(
  uid: string,
  badPN: string,
  correctedPN: string,
  type: string
): Promise<any[]> {
  const corrs = await loadCorrectionDB(uid);
  corrs.push({ badPN, correctedPN, type, createdAt: Date.now() });
  _correctionsCache = [...corrs];
  await fbDb().doc(_correctionsPath(uid)).set({ corrections: _correctionsCache });
  return _correctionsCache;
}

export function guessCorrection(origPN: string, newPN: string): 'format' | 'extraction' {
  const norm = (s: string) => s.replace(/[-\s./\\()]/g, '').toUpperCase();
  const a = norm(origPN);
  const b = norm(newPN);
  if (a === b) return 'format';
  // Count overlapping chars
  let matches = 0;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  for (const c of shorter) {
    if (longer.includes(c)) matches++;
  }
  const ratio = matches / Math.max(a.length, b.length, 1);
  return ratio >= 0.55 ? 'format' : 'extraction';
}

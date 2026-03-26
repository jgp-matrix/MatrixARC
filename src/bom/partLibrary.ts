// ─── Part Library ────────────────────────────────────────────────────────────
// Fuzzy matching, corrections, and part library management.

import type { BomRow, PartLibraryEntry, PartCorrection } from '@/core/types';
import { normPart } from './deduplicator';

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

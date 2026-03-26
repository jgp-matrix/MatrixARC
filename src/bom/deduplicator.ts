// ─── BOM Deduplication ───────────────────────────────────────────────────────
// Merge and deduplicate BOM rows by normalized part number.

import type { BomRow } from '@/core/types';

/**
 * Normalize a part number for matching (strip spaces, dashes, dots, uppercase).
 */
export function normPart(s: string): string {
  return (s || '').replace(/[\s\-.]/g, '').toUpperCase();
}

/**
 * Fuzzy match two part numbers.
 * Exact normalized match OR one contains the other (for manufacturer prefixes).
 */
export function partMatch(a: string, b: string): boolean {
  const na = normPart(a);
  const nb = normPart(b);
  if (!na || !nb) return false;
  return na === nb || (na.length >= 6 && nb.length >= 6 && (na.includes(nb) || nb.includes(na)));
}

/**
 * Merge multiple BOM arrays, deduplicating by normalized part number.
 * Sums quantities for duplicates.
 */
export function mergeBoms(bomArrays: BomRow[][]): BomRow[] {
  const map = new Map<string, BomRow>();

  for (const bom of bomArrays) {
    for (const row of bom) {
      if (row.isLaborRow || row.isCrossed) continue;
      const key = normPart(row.partNumber) || row.description?.toLowerCase() || row.id;
      const existing = map.get(key);
      if (existing) {
        existing.qty = (existing.qty || 0) + (row.qty || 0);
      } else {
        map.set(key, { ...row, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` });
      }
    }
  }

  return Array.from(map.values());
}

/**
 * Deduplicate a single BOM array in place.
 */
export function deduplicateBom(bom: BomRow[]): BomRow[] {
  return mergeBoms([bom]);
}

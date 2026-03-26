import { describe, it, expect } from 'vitest';
import { normPart, partMatch, mergeBoms, deduplicateBom } from '@/bom/deduplicator';
import type { BomRow } from '@/core/types';

// ─── Helper to create a minimal BomRow ───────────────────────────────────────
function row(overrides: Partial<BomRow> = {}): BomRow {
  return {
    id: `row-${Math.random()}`,
    partNumber: '',
    description: '',
    manufacturer: '',
    qty: 1,
    unitPrice: null,
    priceSource: null,
    notes: '',
    ...overrides,
  };
}

// ─── normPart ────────────────────────────────────────────────────────────────

describe('normPart', () => {
  it('strips spaces, dashes, dots and uppercases', () => {
    expect(normPart('AF09-30-10-13')).toBe('AF09301013');
    expect(normPart('SCE 24EL.20X10')).toBe('SCE24EL20X10');
    expect(normPart('abc-def.ghi jkl')).toBe('ABCDEFGHIJKL');
  });

  it('handles empty and null-ish input', () => {
    expect(normPart('')).toBe('');
    expect(normPart(null as any)).toBe('');
    expect(normPart(undefined as any)).toBe('');
  });

  it('preserves digits and letters only', () => {
    expect(normPart('100-C09D10')).toBe('100C09D10');
    expect(normPart('1489-M1C050')).toBe('1489M1C050');
  });

  it('is idempotent', () => {
    const result = normPart('AF09-30-10-13');
    expect(normPart(result)).toBe(result);
  });
});

// ─── partMatch ───────────────────────────────────────────────────────────────

describe('partMatch', () => {
  it('matches identical part numbers', () => {
    expect(partMatch('AF09-30-10-13', 'AF09-30-10-13')).toBe(true);
  });

  it('matches after normalization (spaces, dashes, case)', () => {
    expect(partMatch('AF09-30-10-13', 'af09 30.10.13')).toBe(true);
    expect(partMatch('100-C09D10', '100C09D10')).toBe(true);
  });

  it('matches when one contains the other (manufacturer prefix)', () => {
    expect(partMatch('ABBAF09301013', 'AF09-30-10-13')).toBe(true);
  });

  it('rejects non-matching part numbers', () => {
    expect(partMatch('AF09-30-10-13', 'XYZ-123-456')).toBe(false);
    expect(partMatch('100-C09D10', '200-C09D10')).toBe(false);
  });

  it('rejects empty inputs', () => {
    expect(partMatch('', 'AF09-30-10-13')).toBe(false);
    expect(partMatch('AF09-30-10-13', '')).toBe(false);
    expect(partMatch('', '')).toBe(false);
  });

  it('requires 6+ chars for contains matching (short strings need exact)', () => {
    // Short strings: "ABC" vs "ABCDE" — neither is 6+ chars normalized
    expect(partMatch('ABC', 'ABCDE')).toBe(false);
    // Long enough for contains
    expect(partMatch('ABCDEF', 'XABCDEFX')).toBe(true);
  });
});

// ─── mergeBoms ───────────────────────────────────────────────────────────────

describe('mergeBoms', () => {
  it('merges two BOMs deduplicating by normalized part number', () => {
    const bom1 = [row({ partNumber: 'AF09-30-10-13', qty: 2 })];
    const bom2 = [row({ partNumber: 'AF09 30.10.13', qty: 3 })];

    const merged = mergeBoms([bom1, bom2]);
    expect(merged).toHaveLength(1);
    expect(merged[0].qty).toBe(5);
  });

  it('keeps distinct part numbers separate', () => {
    const bom1 = [row({ partNumber: 'AF09-30-10-13', qty: 1 })];
    const bom2 = [row({ partNumber: 'XYZ-123', qty: 2 })];

    const merged = mergeBoms([bom1, bom2]);
    expect(merged).toHaveLength(2);
  });

  it('skips labor rows', () => {
    const bom = [
      row({ partNumber: 'AF09-30-10-13', qty: 1 }),
      row({ partNumber: 'LABOR-001', qty: 8, isLaborRow: true }),
    ];

    const merged = mergeBoms([bom]);
    expect(merged).toHaveLength(1);
    expect(merged[0].partNumber).toBe('AF09-30-10-13');
  });

  it('skips crossed-out rows', () => {
    const bom = [
      row({ partNumber: 'GOOD-PART', qty: 1 }),
      row({ partNumber: 'OLD-PART', qty: 2, isCrossed: true }),
    ];

    const merged = mergeBoms([bom]);
    expect(merged).toHaveLength(1);
    expect(merged[0].partNumber).toBe('GOOD-PART');
  });

  it('handles empty arrays', () => {
    expect(mergeBoms([])).toHaveLength(0);
    expect(mergeBoms([[], []])).toHaveLength(0);
  });

  it('uses description as fallback key when partNumber is empty', () => {
    const bom = [
      row({ partNumber: '', description: 'Wire 14AWG Red', qty: 1 }),
      row({ partNumber: '', description: 'Wire 14AWG Red', qty: 2 }),
    ];

    const merged = mergeBoms([bom]);
    expect(merged).toHaveLength(1);
    expect(merged[0].qty).toBe(3);
  });

  it('assigns new IDs to merged rows', () => {
    const original = row({ id: 'original-id', partNumber: 'TEST-001', qty: 1 });
    const merged = mergeBoms([[original]]);
    expect(merged[0].id).not.toBe('original-id');
  });

  it('sums quantities across three BOMs', () => {
    const bom1 = [row({ partNumber: 'QD100X300HW', qty: 1 })];
    const bom2 = [row({ partNumber: 'QD100X300HW', qty: 1 })];
    const bom3 = [row({ partNumber: 'QD100X300HW', qty: 1 })];

    const merged = mergeBoms([bom1, bom2, bom3]);
    expect(merged).toHaveLength(1);
    expect(merged[0].qty).toBe(3);
  });
});

// ─── deduplicateBom ──────────────────────────────────────────────────────────

describe('deduplicateBom', () => {
  it('deduplicates within a single BOM', () => {
    const bom = [
      row({ partNumber: 'QD100X300HW', qty: 1 }),
      row({ partNumber: 'QD100X300HW', qty: 2 }),
      row({ partNumber: 'OTHER-PART', qty: 5 }),
    ];

    const deduped = deduplicateBom(bom);
    expect(deduped).toHaveLength(2);

    const qd = deduped.find(r => normPart(r.partNumber) === 'QD100X300HW');
    expect(qd?.qty).toBe(3);
  });
});

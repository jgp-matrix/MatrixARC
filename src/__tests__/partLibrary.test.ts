import { describe, it, expect } from 'vitest';
import { findPartSuggestion, applyPartCorrections } from '@/bom/partLibrary';
import type { BomRow, PartLibraryEntry, PartCorrection } from '@/core/types';

function row(overrides: Partial<BomRow> = {}): BomRow {
  return {
    id: 'r1', partNumber: '', description: '', manufacturer: '',
    qty: 1, unitPrice: null, priceSource: null, notes: '',
    ...overrides,
  };
}

function libEntry(overrides: Partial<PartLibraryEntry> = {}): PartLibraryEntry {
  return {
    key: '', manufacturer: '', description: '', partNumber: '', updatedAt: 0,
    ...overrides,
  };
}

// ─── findPartSuggestion ──────────────────────────────────────────────────────

describe('findPartSuggestion', () => {
  it('finds exact match by manufacturer||description key', () => {
    const library = [
      libEntry({
        key: 'abb||contactor 30a',
        manufacturer: 'ABB',
        description: 'Contactor 30A',
        partNumber: 'AF30-30-10-13',
      }),
    ];
    const bomRow = row({
      manufacturer: 'ABB',
      description: 'Contactor 30A',
      partNumber: 'WRONG-PART',
    });

    expect(findPartSuggestion(library, bomRow)).toBe('AF30-30-10-13');
  });

  it('returns null when part number already matches', () => {
    const library = [
      libEntry({
        key: 'abb||contactor 30a',
        manufacturer: 'ABB',
        description: 'Contactor 30A',
        partNumber: 'AF30-30-10-13',
      }),
    ];
    const bomRow = row({
      manufacturer: 'ABB',
      description: 'Contactor 30A',
      partNumber: 'AF30-30-10-13',
    });

    expect(findPartSuggestion(library, bomRow)).toBeNull();
  });

  it('returns null when library is empty', () => {
    expect(findPartSuggestion([], row({ manufacturer: 'ABB', description: 'Test' }))).toBeNull();
  });

  it('returns null when row has no manufacturer', () => {
    const library = [libEntry({ key: 'abb||test', manufacturer: 'ABB', description: 'Test', partNumber: 'X' })];
    expect(findPartSuggestion(library, row({ manufacturer: '', description: 'Test' }))).toBeNull();
  });

  it('returns null when row has no description', () => {
    const library = [libEntry({ key: 'abb||test', manufacturer: 'ABB', description: 'Test', partNumber: 'X' })];
    expect(findPartSuggestion(library, row({ manufacturer: 'ABB', description: '' }))).toBeNull();
  });

  it('matches case-insensitively on manufacturer and description', () => {
    const library = [
      libEntry({
        key: 'allen-bradley||motor starter 10hp',
        manufacturer: 'Allen-Bradley',
        description: 'Motor Starter 10HP',
        partNumber: '509-BOD',
      }),
    ];
    const bomRow = row({
      manufacturer: 'ALLEN-BRADLEY',
      description: 'MOTOR STARTER 10HP',
      partNumber: 'WRONG',
    });

    expect(findPartSuggestion(library, bomRow)).toBe('509-BOD');
  });

  it('returns null for different manufacturer', () => {
    const library = [
      libEntry({
        key: 'abb||contactor 30a',
        manufacturer: 'ABB',
        description: 'Contactor 30A',
        partNumber: 'AF30-30-10-13',
      }),
    ];
    const bomRow = row({
      manufacturer: 'Siemens',
      description: 'Contactor 30A',
      partNumber: 'WRONG',
    });

    expect(findPartSuggestion(library, bomRow)).toBeNull();
  });
});

// ─── applyPartCorrections ────────────────────────────────────────────────────

describe('applyPartCorrections', () => {
  it('corrects known bad part numbers', () => {
    const corrections: PartCorrection[] = [
      { badPN: '100-C09O10', correctedPN: '100-C09D10', type: 'ocr', createdAt: 0 },
    ];
    const bom = [row({ partNumber: '100-C09O10', qty: 2 })];

    const result = applyPartCorrections(corrections, bom);
    expect(result[0].partNumber).toBe('100-C09D10');
    expect(result[0].autoReplaced).toBe(true);
  });

  it('matches corrections after normalization (ignores dashes/spaces)', () => {
    const corrections: PartCorrection[] = [
      { badPN: '100C09O10', correctedPN: '100-C09D10', type: 'ocr', createdAt: 0 },
    ];
    const bom = [row({ partNumber: '100-C09O10', qty: 1 })];

    const result = applyPartCorrections(corrections, bom);
    expect(result[0].partNumber).toBe('100-C09D10');
  });

  it('does not modify rows that already have the correct part number', () => {
    const corrections: PartCorrection[] = [
      { badPN: '100-C09O10', correctedPN: '100-C09D10', type: 'ocr', createdAt: 0 },
    ];
    const bom = [row({ partNumber: '100-C09D10', qty: 1 })];

    const result = applyPartCorrections(corrections, bom);
    expect(result[0].partNumber).toBe('100-C09D10');
    expect(result[0].autoReplaced).toBeUndefined();
  });

  it('leaves unmatched rows unchanged', () => {
    const corrections: PartCorrection[] = [
      { badPN: 'BAD-PN', correctedPN: 'GOOD-PN', type: 'ocr', createdAt: 0 },
    ];
    const bom = [row({ partNumber: 'UNRELATED-PART', qty: 3 })];

    const result = applyPartCorrections(corrections, bom);
    expect(result[0].partNumber).toBe('UNRELATED-PART');
    expect(result[0].autoReplaced).toBeUndefined();
  });

  it('returns BOM unchanged when corrections are empty', () => {
    const bom = [row({ partNumber: 'TEST-001', qty: 1 })];
    const result = applyPartCorrections([], bom);
    expect(result[0].partNumber).toBe('TEST-001');
  });

  it('returns BOM unchanged when corrections are null', () => {
    const bom = [row({ partNumber: 'TEST-001', qty: 1 })];
    const result = applyPartCorrections(null as any, bom);
    expect(result[0].partNumber).toBe('TEST-001');
  });

  it('applies multiple corrections in one pass', () => {
    const corrections: PartCorrection[] = [
      { badPN: 'BAD-A', correctedPN: 'GOOD-A', type: 'ocr', createdAt: 0 },
      { badPN: 'BAD-B', correctedPN: 'GOOD-B', type: 'ocr', createdAt: 0 },
    ];
    const bom = [
      row({ partNumber: 'BAD-A', qty: 1 }),
      row({ partNumber: 'BAD-B', qty: 2 }),
      row({ partNumber: 'FINE-C', qty: 3 }),
    ];

    const result = applyPartCorrections(corrections, bom);
    expect(result[0].partNumber).toBe('GOOD-A');
    expect(result[1].partNumber).toBe('GOOD-B');
    expect(result[2].partNumber).toBe('FINE-C');
  });

  it('does not mutate the original BOM array', () => {
    const corrections: PartCorrection[] = [
      { badPN: 'OLD-PN', correctedPN: 'NEW-PN', type: 'ocr', createdAt: 0 },
    ];
    const bom = [row({ partNumber: 'OLD-PN', qty: 1 })];
    const originalPN = bom[0].partNumber;

    applyPartCorrections(corrections, bom);
    expect(bom[0].partNumber).toBe(originalPN);
  });
});

import { describe, it, expect } from 'vitest';
import { normalizeUom, normalizePart, partsMatch } from '@/services/businessCentral/items';

// ─── normalizeUom ────────────────────────────────────────────────────────────

describe('normalizeUom', () => {
  it('maps common short codes to BC standard', () => {
    expect(normalizeUom('E')).toBe('EA');
    expect(normalizeUom('EA')).toBe('EA');
    expect(normalizeUom('ea')).toBe('EA');
    expect(normalizeUom('PC')).toBe('PCS');
    expect(normalizeUom('PCS')).toBe('PCS');
    expect(normalizeUom('FT')).toBe('FT');
    expect(normalizeUom('M')).toBe('M');
    expect(normalizeUom('LB')).toBe('LB');
    expect(normalizeUom('KG')).toBe('KG');
  });

  it('maps box/roll/pair variants', () => {
    expect(normalizeUom('BX')).toBe('BOX');
    expect(normalizeUom('BOX')).toBe('BOX');
    expect(normalizeUom('RL')).toBe('ROLL');
    expect(normalizeUom('ROLL')).toBe('ROLL');
    expect(normalizeUom('PR')).toBe('PR');
    expect(normalizeUom('SET')).toBe('SET');
    expect(normalizeUom('PKG')).toBe('PKG');
  });

  it('maps hour and C100', () => {
    expect(normalizeUom('HR')).toBe('HOUR');
    expect(normalizeUom('HOUR')).toBe('HOUR');
    expect(normalizeUom('C')).toBe('C100');
  });

  it('defaults to EA for empty/null input', () => {
    expect(normalizeUom('')).toBe('EA');
    expect(normalizeUom(null as any)).toBe('EA');
    expect(normalizeUom(undefined as any)).toBe('EA');
  });

  it('trims whitespace', () => {
    expect(normalizeUom('  EA  ')).toBe('EA');
    expect(normalizeUom(' ft ')).toBe('FT');
  });

  it('passes through unknown UOMs unchanged (uppercased)', () => {
    expect(normalizeUom('GAL')).toBe('GAL');
    expect(normalizeUom('EACH')).toBe('EACH');
    expect(normalizeUom('custom')).toBe('CUSTOM');
  });
});

// ─── normalizePart ───────────────────────────────────────────────────────────

describe('normalizePart', () => {
  it('strips spaces, dashes, dots and uppercases', () => {
    expect(normalizePart('AF09-30-10-13')).toBe('AF09301013');
    expect(normalizePart('SCE 24EL.20X10')).toBe('SCE24EL20X10');
  });

  it('handles empty/null input', () => {
    expect(normalizePart('')).toBe('');
    expect(normalizePart(null as any)).toBe('');
    expect(normalizePart(undefined as any)).toBe('');
  });
});

// ─── partsMatch ──────────────────────────────────────────────────────────────

describe('partsMatch', () => {
  it('matches exact after normalization', () => {
    expect(partsMatch('AF09-30-10-13', 'AF09.30.10.13')).toBe(true);
    expect(partsMatch('100-C09D10', '100C09D10')).toBe(true);
  });

  it('matches when one contains the other (no length restriction)', () => {
    // Unlike bom/deduplicator.partMatch, this version has NO 6-char minimum
    expect(partsMatch('ABC', 'XABCX')).toBe(true);
    expect(partsMatch('XABCX', 'ABC')).toBe(true);
  });

  it('rejects non-matching', () => {
    expect(partsMatch('AF09-30', 'XYZ-123')).toBe(false);
  });

  it('rejects empty inputs', () => {
    expect(partsMatch('', 'AF09')).toBe(false);
    expect(partsMatch('AF09', '')).toBe(false);
    expect(partsMatch('', '')).toBe(false);
  });

  it('handles real-world Allen-Bradley part numbers', () => {
    expect(partsMatch('100-C09D10', '100-C09D10')).toBe(true);
    expect(partsMatch('1489-M1C050', '1489-M1C050')).toBe(true);
    expect(partsMatch('100-C09D10', '100-C09O10')).toBe(false); // D vs O — different!
  });

  it('handles manufacturer-prefixed part numbers', () => {
    // "ABB AF09-30" contains "AF0930" after normalization
    expect(partsMatch('ABB AF09-30', 'AF09-30')).toBe(true);
  });
});

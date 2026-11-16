import { describe, it, expect } from 'vitest';
import {
  convertToGaj,
  convertFromGaj,
  normalizeUnitString,
} from '../src/utils/units.js';

describe('Units Utility (Land & Property Size)', () => {
  it('converts Gaj directly with 1:1 ratio', () => {
    const res = convertToGaj(150, 'gaj');
    expect(res.sizeGaj).toBe(150);
    expect(res.needsReview).toBe(false);
  });

  it('converts square feet to gaj (9 sq ft = 1 gaj)', () => {
    const res = convertToGaj(900, 'sqft');
    expect(res.sizeGaj).toBe(100);
    expect(res.needsReview).toBe(false);
  });

  it('converts marla using regional standard (1 marla = 30.25 gaj)', () => {
    const res = convertToGaj(8, 'marla');
    // 8 * 30.25 = 242 gaj
    expect(res.sizeGaj).toBe(242);
    expect(res.needsReview).toBe(false);
    expect(res.warning).toContain('30.25 gaj');
  });

  it('converts kanal (1 kanal = 20 marla = 605 gaj)', () => {
    const res = convertToGaj(1, 'kanal');
    expect(res.sizeGaj).toBe(605);
    expect(res.needsReview).toBe(false);
  });

  it('converts acre (1 acre = 4840 gaj)', () => {
    const res = convertToGaj(2, 'acre');
    expect(res.sizeGaj).toBe(9680);
    expect(res.needsReview).toBe(false);
  });

  it('CRITICAL: NEVER auto-converts bigha and flags needsReview', () => {
    const res = convertToGaj(5, 'bigha');
    expect(res.sizeGaj).toBeNull();
    expect(res.needsReview).toBe(true);
    expect(res.warning).toContain('auto-conversion disabled');
  });

  it('converts from Gaj to other units correctly', () => {
    expect(convertFromGaj(100, 'sqft')).toBe(900);
    expect(convertFromGaj(242, 'marla')).toBe(8);
    expect(convertFromGaj(605, 'kanal')).toBe(1);
    expect(convertFromGaj(4840, 'acre')).toBe(1);
  });

  it('normalizes colloquial unit strings', () => {
    expect(normalizeUnitString('gaj')).toBe('gaj');
    expect(normalizeUnitString('gaz')).toBe('gaj');
    expect(normalizeUnitString('sq yard')).toBe('gaj');
    expect(normalizeUnitString('sq. ft.')).toBe('sqft');
    expect(normalizeUnitString('marle')).toBe('marla');
    expect(normalizeUnitString('kanals')).toBe('kanal');
    expect(normalizeUnitString('beega')).toBe('bigha');
    expect(normalizeUnitString('random')).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { safeCompare } from '../src/utils/tokenCompare.js';

describe('Timing-safe token comparison', () => {
  it('returns true for identical strings', () => {
    const a = 'abc1234567890def';
    const b = 'abc1234567890def';
    expect(safeCompare(a, b)).toBe(true);
  });

  it('returns false for different strings of same length', () => {
    const a = 'abc1234567890def';
    const b = 'abc1234567890deg';
    expect(safeCompare(a, b)).toBe(false);
  });

  it('returns false for strings of different lengths', () => {
    expect(safeCompare('short', 'longer_string')).toBe(false);
  });

  it('handles empty strings', () => {
    expect(safeCompare('', '')).toBe(true);
    expect(safeCompare('', 'a')).toBe(false);
  });
});


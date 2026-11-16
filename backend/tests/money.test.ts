import { describe, it, expect } from 'vitest';
import {
  toPaise,
  toRupees,
  formatINR,
  formatShortINR,
  parseMoneyToPaise,
} from '../src/utils/money.js';

describe('Money Utility (Paise & INR Formatting)', () => {
  it('converts rupees to paise accurately without float errors', () => {
    expect(toPaise(100)).toBe(10000);
    expect(toPaise(48.5)).toBe(4850);
    expect(toPaise(13500000)).toBe(1350000000);
  });

  it('converts paise to rupees', () => {
    expect(toRupees(10000)).toBe(100);
    expect(toRupees(4850)).toBe(48.5);
  });

  it('formats standard Indian currency with lakhs and thousands separators', () => {
    // ₹1,50,000 (15000000 paise)
    expect(formatINR(15000000)).toBe('₹1,50,000');
    // ₹48,00,000 (480000000 paise)
    expect(formatINR(480000000)).toBe('₹48,00,000');
  });

  it('formats short human-friendly INR strings', () => {
    // 48 Lakh
    expect(formatShortINR(480000000)).toBe('₹48 L');
    // 1.35 Crore
    expect(formatShortINR(1350000000)).toBe('₹1.35 Cr');
    // 25 Thousand
    expect(formatShortINR(2500000)).toBe('₹25 K');
  });

  it('parses text amounts into paise', () => {
    // "90 lakh" -> 90,00,000 * 100 paise = 900000000 paise
    const parsed90L = parseMoneyToPaise('90 lakh');
    expect(parsed90L?.maxPaise).toBe(900000000);

    // "1.35 cr" -> 1,35,00,000 * 100 paise = 1350000000 paise
    const parsedCr = parseMoneyToPaise('1.35 cr');
    expect(parsedCr?.maxPaise).toBe(1350000000);

    // "40-50 lakh" range
    const range = parseMoneyToPaise('40-50 lakh');
    expect(range?.minPaise).toBe(400000000);
    expect(range?.maxPaise).toBe(500000000);
  });
});


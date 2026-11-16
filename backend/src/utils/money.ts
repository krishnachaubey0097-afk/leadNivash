/**
 * Money utilities:
 * All currency in LeadNivesh is stored as integer paise (1 INR = 100 paise)
 * to avoid floating-point representation bugs.
 */

import { normalizeDevanagariNumerals } from './phone.js';

export function toPaise(rupees: number): number {
  if (isNaN(rupees) || !isFinite(rupees)) {
    throw new Error('Invalid rupee value: must be a finite number');
  }
  return Math.round(rupees * 100);
}

export function toRupees(paise: number): number {
  if (isNaN(paise) || !isFinite(paise)) {
    throw new Error('Invalid paise value: must be a finite number');
  }
  return paise / 100;
}

/**
 * Format paise to standard Indian localized currency string.
 * Example: 15000000 paise (= ₹1,50,000) -> "₹1,50,000"
 */
export function formatINR(paise: number): string {
  const rupees = toRupees(paise);
  const formatted = new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(rupees);
  return `₹${formatted}`;
}

/**
 * Short human-friendly INR display:
 * Example: 480000000 paise (= 48 Lakh) -> "₹48 L"
 * Example: 1350000000 paise (= 1.35 Cr) -> "₹1.35 Cr"
 * Example: 2500000 paise (= 25 Thousand) -> "₹25 K"
 */
export function formatShortINR(paise: number): string {
  const rupees = toRupees(paise);
  if (rupees >= 10000000) {
    const cr = rupees / 10000000;
    return `₹${parseFloat(cr.toFixed(2))} Cr`;
  }
  if (rupees >= 100000) {
    const lakh = rupees / 100000;
    return `₹${parseFloat(lakh.toFixed(2))} L`;
  }
  if (rupees >= 1000) {
    const k = rupees / 1000;
    return `₹${parseFloat(k.toFixed(1))} K`;
  }
  return formatINR(paise);
}

/**
 * Parse text strings like "90 lakh", "1.35 cr", "50k", "40-50 lac", "65 लाख", "1.5 करोड़" into paise.
 * Fully supports Hindi words and Devanagari numerals.
 */
export function parseMoneyToPaise(text: string): { minPaise?: number; maxPaise?: number } | null {
  if (!text) return null;
  const clean = normalizeDevanagariNumerals(text.toLowerCase().trim());

  // Multipliers for Lakh (including Hindi लाख, लाख्स, लैक, lac, lacs, lakh, lakhs, l)
  const lakhMatch = clean.match(/([\d.]+)\s*(?:-|to|से)?\s*([\d.]+)?\s*(?:lakhs?|lacs?|लाख(?:्स)?|लैक|l\b)/i);
  if (lakhMatch) {
    const min = parseFloat(lakhMatch[1] || '0');
    const max = lakhMatch[2] ? parseFloat(lakhMatch[2]) : undefined;
    if (max !== undefined) {
      return { minPaise: toPaise(min * 100000), maxPaise: toPaise(max * 100000) };
    }
    return { maxPaise: toPaise(min * 100000) };
  }

  // Multipliers for Crore (including Hindi करोड़, करोड, सीआर, crore, crores, cr, crs)
  const crMatch = clean.match(/([\d.]+)\s*(?:-|to|से)?\s*([\d.]+)?\s*(?:crores?|crs?|करोड़|करोड|सीआर|cr\b)/i);
  if (crMatch) {
    const min = parseFloat(crMatch[1] || '0');
    const max = crMatch[2] ? parseFloat(crMatch[2]) : undefined;
    if (max !== undefined) {
      return { minPaise: toPaise(min * 10000000), maxPaise: toPaise(max * 10000000) };
    }
    return { maxPaise: toPaise(min * 10000000) };
  }

  // Multipliers for Thousand / K (including Hindi हज़ार, हजार, k, thousand)
  const kMatch = clean.match(/([\d.]+)\s*(?:-|to|से)?\s*([\d.]+)?\s*(?:k\b|thousands?|हज़ार|हजार)/i);
  if (kMatch && kMatch[1]) {
    const min = parseFloat(kMatch[1]);
    const max = kMatch[2] ? parseFloat(kMatch[2]) : undefined;
    if (max !== undefined) {
      return { minPaise: toPaise(min * 1000), maxPaise: toPaise(max * 1000) };
    }
    return { maxPaise: toPaise(min * 1000) };
  }

  return null;
}

export const formatPaiseToInr = formatINR;

export function parseInrToPaise(text: string): number {
  const res = parseMoneyToPaise(text);
  if (res && res.maxPaise) return res.maxPaise;
  const clean = normalizeDevanagariNumerals(text);
  const digitsOnly = clean.replace(/[^\d.]/g, '');
  const plain = parseFloat(digitsOnly);
  if (!isNaN(plain) && plain > 0) {
    return toPaise(plain);
  }
  throw new Error(`Cannot parse money from "${text}"`);
}


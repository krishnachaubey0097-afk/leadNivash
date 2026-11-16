import { parsePhoneNumberFromString } from 'libphonenumber-js';

// Convert Hindi/Devanagari numerals (०-९) to standard ASCII (0-9)
export function normalizeDevanagariNumerals(str: string): string {
  if (!str) return '';
  return str.replace(/[\u0966-\u096F]/g, (digit) => {
    return String.fromCharCode(digit.charCodeAt(0) - 0x0966 + 0x30);
  });
}

/**
 * Normalizes phone numbers to standard E.164 format (e.g. +919876543210).
 * Defaults to India ('IN') country code if none specified.
 * Resilient against Devnagari digits, leading zeros (09876543210), hyphens, spaces.
 */
export function normalizePhoneE164(phone: string, defaultCountry: 'IN' | string = 'IN'): string {
  if (!phone || !phone.trim()) return '';

  const clean = normalizeDevanagariNumerals(phone.trim());
  const parsed = parsePhoneNumberFromString(clean, defaultCountry as any);

  if (parsed && parsed.isValid()) {
    return parsed.format('E.164');
  }

  // Fallback for common Indian numbers (10 digits, or 11 digits starting with 0, or 12 digits starting with 91)
  const digits = clean.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return `+91${digits.slice(1)}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }

  return clean.startsWith('+') ? clean : `+${digits}`;
}

export function isValidPhone(phone: string, defaultCountry: 'IN' | string = 'IN'): boolean {
  if (!phone || !phone.trim()) return false;
  const clean = normalizeDevanagariNumerals(phone.trim());
  const parsed = parsePhoneNumberFromString(clean, defaultCountry as any);
  if (parsed && parsed.isValid()) return true;
  const digits = clean.replace(/\D/g, '');
  if (digits.length === 10) return true;
  if (digits.length === 11 && digits.startsWith('0')) return true;
  if (digits.length === 12 && digits.startsWith('91')) return true;
  return false;
}


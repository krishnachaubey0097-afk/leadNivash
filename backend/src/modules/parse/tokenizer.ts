import { parsePhoneNumberWithError } from 'libphonenumber-js';

export interface TokenizedResult {
  tokenizedText: string;
  phoneMap: Record<string, string>; // { '{{PHONE_0}}': '+919812345678' }
}

/**
 * Regex for detecting Indian phone numbers (10 digits, optional +91, 0, or spaces/dashes).
 */
const PHONE_PATTERN = /(?:(?:\+91|91|0)?[ -]?)?([6-9]\d{9})\b/g;

/**
 * Tokenizes Indian phone numbers in raw text before sending to LLM.
 * Shields broker/client PII and prevents phone numbers from leaking into prompt cache/logs.
 */
export function tokenizePhones(rawText: string): TokenizedResult {
  if (!rawText) {
    return { tokenizedText: '', phoneMap: {} };
  }

  const phoneMap: Record<string, string> = {};
  let tokenCounter = 0;

  const tokenizedText = rawText.replace(PHONE_PATTERN, (match, digits) => {
    try {
      const parsed = parsePhoneNumberWithError(digits, 'IN');
      if (parsed && parsed.isValid()) {
        const token = `{{PHONE_${tokenCounter++}}}`;
        phoneMap[token] = parsed.format('E.164');
        return token;
      }
    } catch {
      // Fallback: check if 10 digits starting with 6-9
      if (/^[6-9]\d{9}$/.test(digits)) {
        const token = `{{PHONE_${tokenCounter++}}}`;
        phoneMap[token] = `+91${digits}`;
        return token;
      }
    }
    return match;
  });

  return { tokenizedText, phoneMap };
}

/**
 * Restores original E.164 phone numbers into extracted LLM output.
 */
export function detokenizePhones(target: any, phoneMap: Record<string, string>): any {
  if (target === null || target === undefined) {
    return target;
  }

  if (typeof target === 'string') {
    let result = target;
    for (const [token, phone] of Object.entries(phoneMap)) {
      if (result.includes(token)) {
        result = result.replaceAll(token, phone);
      }
    }
    return result;
  }

  if (Array.isArray(target)) {
    return target.map((item) => detokenizePhones(item, phoneMap));
  }

  if (typeof target === 'object') {
    const output: Record<string, any> = {};
    for (const [key, val] of Object.entries(target)) {
      output[key] = detokenizePhones(val, phoneMap);
    }
    return output;
  }

  return target;
}


import { normalizeDevanagariNumerals } from '../../utils/phone.js';

export interface ExtractionHints {
  itemTypeHint?: 'listing' | 'buyer';
  purposeHint?: 'Sale' | 'Rent';
  sizeHint?: { value: number; unit: string; maxValue?: number };
  priceHintRaw?: string;
  detectedLocalityHint?: string;
  keywords: string[];
}

const BUYER_KEYWORDS = [
  'chahiye',
  'chahie',
  'req',
  'requirement',
  'client',
  'buyer',
  'looking for',
  'need',
  'urgent requirement',
  'demanding',
  'चाहिए',
  'चाहिये',
  'खरीदना',
  'ज़रूरत',
  'जरुरत',
  'रिक्वायरमेंट',
];

const LISTING_KEYWORDS = [
  'for sale',
  'available',
  'bikau',
  'bechna',
  'urgent sale',
  'plot for sale',
  'kothi for sale',
  'floor available',
  'to let',
  'kiraya',
  'demand',
  'बिकाऊ',
  'बेचना',
  'उपलब्ध',
  'सेल',
  'बिक्री',
  'डिमांड',
];

const RENT_KEYWORDS = ['rent', 'kiraya', 'to let', 'lease', 'per month', '/month', 'p.m.', 'pm', 'किराया', 'किराये पर', 'किराए पर'];

/**
 * Extracts heuristic hints from raw unparsed broker text to guide and assist parsing.
 * Supports English, Hinglish, Hindi/Devanagari, and Unicode emojis.
 */
export function detectHints(text: string): ExtractionHints {
  const normalizedText = normalizeDevanagariNumerals(text || '');
  const lower = normalizedText.toLowerCase();
  const keywords: string[] = [];

  // 1. Detect itemType hint
  let itemTypeHint: 'listing' | 'buyer' | undefined = undefined;
  const isBuyer = BUYER_KEYWORDS.some((kw) => {
    if (lower.includes(kw)) {
      keywords.push(kw);
      return true;
    }
    return false;
  });

  const isListing = LISTING_KEYWORDS.some((kw) => {
    if (lower.includes(kw)) {
      keywords.push(kw);
      return true;
    }
    return false;
  });

  if (isBuyer && !isListing) {
    itemTypeHint = 'buyer';
  } else if (isListing && !isBuyer) {
    itemTypeHint = 'listing';
  }

  // 2. Purpose hint
  let purposeHint: 'Sale' | 'Rent' = 'Sale';
  if (RENT_KEYWORDS.some((kw) => lower.includes(kw))) {
    purposeHint = 'Rent';
  }

  // 3. Size hint (support ranges and Hindi unit synonyms)
  let sizeHint: { value: number; unit: string; maxValue?: number } | undefined = undefined;
  const unitsRegex = '(?:gaj|sqft|sq\\s*ft|yards?|marla|kanal|bigha|sq\\s*yd|गज|गज़|मरला|कनाल|बीघा)';
  const boundary = '(?=[\\s।॥,.;:!?\\-/]|$|[^\\w\\u0900-\\u097F])';

  const rangeRegex = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:to|-|से)\\s*(\\d+(?:\\.\\d+)?)\\s*(${unitsRegex})${boundary}`, 'i');
  const rangeMatch = normalizedText.match(rangeRegex);

  const normalizeUnit = (u: string): string => {
    const raw = u.toLowerCase().replace(/\s+/g, '');
    if (raw === 'गज' || raw === 'गज़' || raw.startsWith('yard') || raw === 'sqyd') return 'gaj';
    if (raw === 'मरला') return 'marla';
    if (raw === 'कनाल') return 'kanal';
    if (raw === 'बीघा') return 'bigha';
    if (raw.startsWith('sq') || raw === 'sqft') return 'sqft';
    return raw;
  };

  if (rangeMatch && rangeMatch[1] && rangeMatch[2] && rangeMatch[3]) {
    const minVal = parseFloat(rangeMatch[1]);
    const maxVal = parseFloat(rangeMatch[2]);
    sizeHint = { value: minVal, unit: normalizeUnit(rangeMatch[3]), maxValue: maxVal };
  } else {
    const singleRegex = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${unitsRegex})${boundary}`, 'i');
    const sizeMatch = normalizedText.match(singleRegex);
    if (sizeMatch && sizeMatch[1] && sizeMatch[2]) {
      const val = parseFloat(sizeMatch[1]);
      sizeHint = { value: val, unit: normalizeUnit(sizeMatch[2]) };
    }
  }

  // 4. Price hint raw (support English and Hindi lakh/crore/thousand with sentence boundaries)
  let priceHintRaw: string | undefined = undefined;
  const priceRegex = new RegExp(`(?:(?:rs\\.?|inr|₹)\\s*)?(\\d+(?:\\.\\d+)?)\\s*(?:cr(?:ores?)?|lakh?s?|lacs?|k\\b|thousands?|करोड़|करोड|लाख(?:्स)?|लैक|हज़ार|हजार)${boundary}`, 'i');
  const priceMatch = normalizedText.match(priceRegex);
  if (priceMatch) {
    priceHintRaw = priceMatch[0].trim();
  } else {
    const rentPriceMatch = normalizedText.match(/(?:(?:rs\.?|inr|₹)\s*)?(\d{4,6})\s*(?:per\s*month|\/month|p\.?m\.?|\/pm)?(?=[\s।॥,.;:!?\-/]|$)/i);
    if (rentPriceMatch && rentPriceMatch[1]) {
      priceHintRaw = rentPriceMatch[1].trim();
    }
  }

  return {
    itemTypeHint,
    purposeHint,
    sizeHint,
    priceHintRaw,
    keywords,
  };
}

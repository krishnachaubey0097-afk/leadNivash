/**
 * Land & property size units utility.
 *
 * Ground Rules:
 * 1. 1 gaj = 1 sq yard = 9 sq ft.
 * 2. 1 marla = 30.25 gaj (272.25 sq ft) [Haryana/Punjab regional standard].
 * 3. 1 kanal = 20 marla = 605 gaj.
 * 4. 1 acre = 4840 gaj = 43,560 sq ft.
 * 5. BIGHA RULE: Bigha varies dramatically across states (from 400 gaj to 3025 gaj).
 *    NEVER auto-convert bigha. Return null with a mandatory review warning.
 */

export type SupportedUnit = 'gaj' | 'sqft' | 'marla' | 'kanal' | 'acre' | 'bigha';

export interface UnitConversionResult {
  sizeGaj: number | null;
  warning?: string;
  needsReview: boolean;
}

export const DEFAULT_MARLA_TO_GAJ = 30.25; // 272.25 sq ft / 9 sq ft per gaj

/**
 * Converts any recognized area unit to canonical Gaj (sq yards).
 * If unit is bigha, conversion returns null and flags needsReview.
 */
export function convertToGaj(
  value: number,
  unit: SupportedUnit,
  customMarlaToGaj = DEFAULT_MARLA_TO_GAJ
): UnitConversionResult {
  if (typeof value !== 'number' || isNaN(value) || value <= 0) {
    return {
      sizeGaj: null,
      warning: 'Invalid size value: must be a positive number',
      needsReview: true,
    };
  }

  const normalizedUnit = unit.toLowerCase().trim() as SupportedUnit;

  switch (normalizedUnit) {
    case 'gaj':
      return { sizeGaj: Math.round(value * 100) / 100, needsReview: false };

    case 'sqft':
      // 9 sq ft = 1 gaj
      return { sizeGaj: Math.round((value / 9) * 100) / 100, needsReview: false };

    case 'marla': {
      const gaj = value * customMarlaToGaj;
      return {
        sizeGaj: Math.round(gaj * 100) / 100,
        warning: `Converted using regional standard (1 marla = ${customMarlaToGaj} gaj)`,
        needsReview: false,
      };
    }

    case 'kanal': {
      // 1 kanal = 20 marla
      const gaj = value * 20 * customMarlaToGaj;
      return {
        sizeGaj: Math.round(gaj * 100) / 100,
        warning: `Converted using regional standard (1 kanal = 20 marla = ${20 * customMarlaToGaj} gaj)`,
        needsReview: false,
      };
    }

    case 'acre': {
      // 1 acre = 4840 gaj
      return { sizeGaj: Math.round(value * 4840 * 100) / 100, needsReview: false };
    }

    case 'bigha':
      return {
        sizeGaj: null,
        warning: 'Bigha varies widely by state and tehsil — auto-conversion disabled. Please enter size in Gaj directly.',
        needsReview: true,
      };

    default:
      return {
        sizeGaj: null,
        warning: `Unrecognized unit: ${unit}. Assumed no conversion.`,
        needsReview: true,
      };
  }
}

/**
 * Converts canonical Gaj into other common units.
 */
export function convertFromGaj(
  sizeGaj: number,
  targetUnit: 'sqft' | 'marla' | 'kanal' | 'acre',
  customMarlaToGaj = DEFAULT_MARLA_TO_GAJ
): number {
  if (sizeGaj <= 0) return 0;
  switch (targetUnit) {
    case 'sqft':
      return Math.round(sizeGaj * 9 * 100) / 100;
    case 'marla':
      return Math.round((sizeGaj / customMarlaToGaj) * 100) / 100;
    case 'kanal':
      return Math.round((sizeGaj / (20 * customMarlaToGaj)) * 100) / 100;
    case 'acre':
      return Math.round((sizeGaj / 4840) * 1000) / 1000;
  }
}

/**
 * Normalizes unit strings from user paste/input (e.g. "gaj", "sq yard", "gaz", "sqft", "marla", "bigha").
 */
export function normalizeUnitString(raw: string): SupportedUnit | null {
  if (!raw) return null;
  const s = raw.toLowerCase().replace(/[^a-z]/g, '');
  if (['gaj', 'gaz', 'yard', 'yards', 'sqyd', 'sqyard'].includes(s)) return 'gaj';
  if (['sqft', 'sqfeet', 'squarefeet', 'ft', 'feet'].includes(s)) return 'sqft';
  if (['marla', 'marle'].includes(s)) return 'marla';
  if (['kanal', 'kanals'].includes(s)) return 'kanal';
  if (['acre', 'acres', 'killa'].includes(s)) return 'acre';
  if (['bigha', 'beega', 'bighas'].includes(s)) return 'bigha';
  return null;
}


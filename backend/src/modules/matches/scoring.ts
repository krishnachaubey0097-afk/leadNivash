import type { IProperty } from '../properties/property.model.js';
import type { IBuyer } from '../buyers/buyer.model.js';
import {
  type MatchReason,
  buildLocalityReason,
  buildBudgetReason,
  buildSizeReason,
  buildTypeReason,
  buildTagReason,
} from './reasons.js';
import { formatShortINR } from '../../utils/money.js';

export type MatchGrade = 'Perfect' | 'Good' | 'Stretch';

export interface MatchScoreResult {
  score: number; // 0 to 100
  grade: MatchGrade;
  reasons: MatchReason[];
  isMatch: boolean;
}

// Compatible property type aliases
const COMPATIBLE_TYPES: Record<string, string[]> = {
  Kothi: ['House', 'Villa'],
  Floor: ['Flat', 'Builder Floor'],
  Flat: ['Floor', 'Apartment'],
};

/**
 * Pure scoring function evaluating Property vs Buyer.
 * Returns null if hard filters reject the match.
 */
export function scoreMatch(
  property: IProperty,
  buyer: IBuyer,
  tolerancePct = 10
): MatchScoreResult | null {
  // ── Hard Filters ──

  // 1. Property must be available
  if (property.status !== 'available') {
    return null;
  }

  // 2. Purpose match (Sale vs Rent)
  if (property.purpose !== buyer.purpose) {
    return null;
  }

  // 3. Price tolerance hard filter
  const maxAllowedPaise = buyer.budget.maxPaise * (1 + tolerancePct / 100);
  if (property.priceDemandPaise > maxAllowedPaise) {
    return null;
  }

  // 4. Locality hard filter
  let localityScore = 0;
  const reasons: MatchReason[] = [];

  if (buyer.anyLocality) {
    localityScore = 28;
    reasons.push({ code: 'LOCALITY_ANY', text: 'Any locality accepted ✓' });
  } else {
    // ⚠️ CRITICAL RULE: Empty locality list with anyLocality=false MUST NOT MATCH!
    if (!buyer.localities || buyer.localities.length === 0) {
      return null;
    }

    const propKey = property.localityKey.toLowerCase().trim();
    const matchedLocality = buyer.localities.find((l) => l.key.toLowerCase().trim() === propKey);

    if (!matchedLocality) {
      // Check partial/alias match
      const aliasMatch = buyer.localities.find((l) =>
        propKey.includes(l.key) || l.key.includes(propKey)
      );
      if (!aliasMatch) {
        return null; // Locality does not match
      }
      localityScore = 28;
      reasons.push(buildLocalityReason(property.locality, false));
    } else {
      localityScore = 35;
      reasons.push(buildLocalityReason(property.locality, true));
    }
  }

  // 5. Property type compatibility hard filter
  let typeScore = 0;
  if (buyer.types && buyer.types.length > 0) {
    const propType = property.type;
    const isExact = buyer.types.includes(propType);
    let isCompatible = false;

    if (!isExact) {
      const aliases = COMPATIBLE_TYPES[propType] || [];
      isCompatible = buyer.types.some((t) => aliases.includes(t));
      if (!isCompatible) {
        return null; // Incompatible type
      }
      typeScore = 6;
      reasons.push(buildTypeReason(propType, false));
    } else {
      typeScore = 10;
      reasons.push(buildTypeReason(propType, true));
    }
  } else {
    typeScore = 8; // Buyer did not specify type
  }

  // ── Scored Components ──

  // 6. Budget Score (max 30 pts)
  let budgetScore = 0;
  if (property.priceDemandPaise <= buyer.budget.maxPaise) {
    budgetScore = 30;
  } else {
    // Linear scale between 30 and 15 for prices within tolerance
    const overBudget = property.priceDemandPaise - buyer.budget.maxPaise;
    const maxExcess = buyer.budget.maxPaise * (tolerancePct / 100);
    const fraction = Math.min(1, overBudget / maxExcess);
    budgetScore = Math.round(30 - fraction * 15);
  }
  reasons.push(
    buildBudgetReason(
      property.priceDemandPaise,
      buyer.budget.maxPaise,
      formatShortINR(property.priceDemandPaise),
      formatShortINR(buyer.budget.maxPaise),
      tolerancePct
    )
  );

  // 7. Size Score (max 20 pts)
  let sizeScore = 10; // Default when buyer specified no size
  if (buyer.sizeGaj) {
    const minG = buyer.sizeGaj.min ?? 0;
    const maxG = buyer.sizeGaj.max ?? Infinity;
    const pGaj = property.sizeGaj;

    if (pGaj >= minG && pGaj <= maxG) {
      sizeScore = 20;
      const r = buildSizeReason(pGaj, buyer.sizeGaj.min, buyer.sizeGaj.max);
      if (r) reasons.push(r);
    } else {
      // Check ±15% buffer
      const minBuffer = minG * 0.85;
      const maxBuffer = maxG * 1.15;
      if (pGaj >= minBuffer && pGaj <= maxBuffer) {
        sizeScore = 12;
        reasons.push({
          code: 'SIZE_STRETCH',
          text: `Size ${pGaj} gaj within ±15% of desired size`,
        });
      } else {
        sizeScore = 5;
      }
    }
  }

  // 8. Extras / Tags Score (max 5 pts)
  let extrasScore = 0;
  if (property.tags && property.tags.length > 0) {
    extrasScore = Math.min(5, property.tags.length * 2.5);
    reasons.push(buildTagReason(property.tags));
  }

  // ── Total Score & Grade ──
  const totalScore = Math.min(100, Math.round(localityScore + budgetScore + sizeScore + typeScore + extrasScore));

  // Below 50 is excluded
  if (totalScore < 50) {
    return null;
  }

  let grade: MatchGrade = 'Stretch';
  if (totalScore >= 85) {
    grade = 'Perfect';
  } else if (totalScore >= 65) {
    grade = 'Good';
  }

  return {
    score: totalScore,
    grade,
    reasons,
    isMatch: true,
  };
}

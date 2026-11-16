export interface MatchReason {
  code: string;
  text: string;
}

export function buildLocalityReason(locality: string, isExact: boolean): MatchReason {
  return {
    code: isExact ? 'LOCALITY_EXACT' : 'LOCALITY_ALIGNED',
    text: `Locality: ${locality} ✓`,
  };
}

export function buildBudgetReason(
  priceDemandPaise: number,
  maxBudgetPaise: number,
  formattedPrice: string,
  formattedBudget: string,
  tolerancePct = 10
): MatchReason {
  if (priceDemandPaise <= maxBudgetPaise) {
    return {
      code: 'BUDGET_WITHIN',
      text: `Price ${formattedPrice} ≤ budget ${formattedBudget} ✓`,
    };
  }

  const diffPaise = priceDemandPaise - maxBudgetPaise;
  const pctOver = Math.round((diffPaise / maxBudgetPaise) * 100);
  return {
    code: 'BUDGET_STRETCH',
    text: `Over budget by ${pctOver}% (within ${tolerancePct}% tolerance)`,
  };
}

export function buildSizeReason(
  propertyGaj: number,
  buyerMinGaj?: number,
  buyerMaxGaj?: number
): MatchReason | null {
  if (buyerMinGaj !== undefined && buyerMaxGaj !== undefined) {
    return {
      code: 'SIZE_IN_RANGE',
      text: `Size ${propertyGaj} gaj within ${buyerMinGaj}–${buyerMaxGaj} gaj ✓`,
    };
  }
  if (buyerMaxGaj !== undefined) {
    return {
      code: 'SIZE_BELOW_MAX',
      text: `Size ${propertyGaj} gaj ≤ max ${buyerMaxGaj} gaj ✓`,
    };
  }
  if (buyerMinGaj !== undefined) {
    return {
      code: 'SIZE_ABOVE_MIN',
      text: `Size ${propertyGaj} gaj ≥ min ${buyerMinGaj} gaj ✓`,
    };
  }
  return null;
}

export function buildTypeReason(propertyType: string, exact: boolean): MatchReason {
  return {
    code: exact ? 'TYPE_EXACT' : 'TYPE_COMPATIBLE',
    text: `Property type: ${propertyType} ✓`,
  };
}

export function buildTagReason(tags: string[]): MatchReason {
  return {
    code: 'TAG_OVERLAP',
    text: `Features matched: ${tags.join(', ')} ✓`,
  };
}


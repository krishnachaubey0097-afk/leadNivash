import { describe, it, expect } from 'vitest';
import { scoreMatch } from '../src/modules/matches/scoring.js';

describe('Match Engine Pure Functions & Golden Fixtures', () => {
  const baseProperty: any = {
    _id: 'prop_1',
    status: 'available',
    purpose: 'Sale',
    type: 'Plot',
    locality: 'Bajaj Colony',
    localityKey: 'bajaj-colony',
    sizeGaj: 200,
    priceDemandPaise: 480000000, // ₹48 Lakh
    tags: ['corner'],
  };

  const baseBuyer: any = {
    _id: 'buyer_1',
    status: 'active',
    purpose: 'Sale',
    types: ['Plot'],
    localities: [{ display: 'Bajaj Colony', key: 'bajaj-colony' }],
    anyLocality: false,
    budget: { maxPaise: 500000000 }, // ₹50 Lakh
    sizeGaj: { min: 180, max: 220 },
  };

  it('Golden Fixture 1: Perfect Match (score >= 85) with exact locality, price, size, and type', () => {
    const result = scoreMatch(baseProperty, baseBuyer, 10);
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThanOrEqual(85);
    expect(result!.grade).toBe('Perfect');
    expect(result!.reasons.some((r) => r.code === 'LOCALITY_EXACT')).toBe(true);
    expect(result!.reasons.some((r) => r.code === 'BUDGET_WITHIN')).toBe(true);
    expect(result!.reasons.some((r) => r.code === 'SIZE_IN_RANGE')).toBe(true);
  });

  it('Golden Fixture 2: Good Match within 10% budget tolerance', () => {
    const slightlyOverProperty = {
      ...baseProperty,
      priceDemandPaise: 520000000, // ₹52 Lakh (within 10% of ₹50L = ₹55L max)
    };
    const result = scoreMatch(slightlyOverProperty, baseBuyer, 10);
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThanOrEqual(65);
    expect(result!.reasons.some((r) => r.code === 'BUDGET_STRETCH')).toBe(true);
  });

  it('Hard Filter: Rejects property priced beyond budget + tolerance', () => {
    const tooExpensiveProperty = {
      ...baseProperty,
      priceDemandPaise: 560000000, // ₹56 Lakh (> 10% tolerance over ₹50L)
    };
    const result = scoreMatch(tooExpensiveProperty, baseBuyer, 10);
    expect(result).toBeNull();
  });

  it('Hard Filter: Rejects when purpose does not match (Sale vs Rent)', () => {
    const rentProperty = { ...baseProperty, purpose: 'Rent' };
    const result = scoreMatch(rentProperty, baseBuyer, 10);
    expect(result).toBeNull();
  });

  it('Hard Filter: Rejects unavailable property status (hold, sold)', () => {
    const soldProperty = { ...baseProperty, status: 'sold' };
    expect(scoreMatch(soldProperty, baseBuyer, 10)).toBeNull();
  });

  it('CRITICAL REGRESSION TEST (MVP v0 Bug M7): Empty buyer locality list with anyLocality=false MUST NOT MATCH', () => {
    const emptyLocalityBuyer = {
      ...baseBuyer,
      localities: [],
      anyLocality: false, // Default is false
    };
    const result = scoreMatch(baseProperty, emptyLocalityBuyer, 10);
    expect(result).toBeNull(); // Strictly rejects!
  });

  it('anyLocality=true matches property across any locality', () => {
    const anyLocalityBuyer = {
      ...baseBuyer,
      localities: [],
      anyLocality: true,
    };
    const result = scoreMatch(baseProperty, anyLocalityBuyer, 10);
    expect(result).not.toBeNull();
    expect(result!.reasons.some((r) => r.code === 'LOCALITY_ANY')).toBe(true);
  });

  it('Compatible type matching (Kothi matches House/Villa)', () => {
    const kothiProperty = { ...baseProperty, type: 'Kothi' };
    const houseBuyer = { ...baseBuyer, types: ['House'] };
    const result = scoreMatch(kothiProperty, houseBuyer, 10);
    expect(result).not.toBeNull();
    expect(result!.reasons.some((r) => r.code === 'TYPE_COMPATIBLE')).toBe(true);
  });
});

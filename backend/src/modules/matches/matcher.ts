import mongoose from 'mongoose';
import { Property, type IProperty } from '../properties/property.model.js';
import { Buyer, type IBuyer } from '../buyers/buyer.model.js';
import { scoreMatch } from './scoring.js';
import { toPublicProperty, type PublicPropertyDto } from '../properties/publicDto.js';

export interface PropertyMatchItem {
  property: PublicPropertyDto;
  score: number;
  grade: string;
  reasons: Array<{ code: string; text: string }>;
}

export interface BuyerMatchItem {
  buyer: {
    id: string;
    name: string;
    phoneE164: string;
    urgency: string;
    budget: { minPaise?: number; maxPaise: number };
  };
  score: number;
  grade: string;
  reasons: Array<{ code: string; text: string }>;
}

export class Matcher {
  /**
   * Buyer -> Properties: Find listings matching a buyer's requirements.
   */
  static async findPropertiesForBuyer(
    buyer: IBuyer,
    userId: string,
    minGrade: 'all' | 'Good' | 'Perfect' = 'all',
    tolerancePct = 10
  ): Promise<PropertyMatchItem[]> {
    // 1. Fetch available properties for this user
    const maxBudget = buyer.budget.maxPaise * (1 + tolerancePct / 100);
    const properties = await Property.find({
      userId,
      status: 'available',
      purpose: buyer.purpose,
      priceDemandPaise: mongoose.trusted({ $lte: maxBudget }),
      isDeleted: false,
    });

    const results: PropertyMatchItem[] = [];

    for (const prop of properties) {
      const match = scoreMatch(prop, buyer, tolerancePct);
      if (!match) continue;

      if (minGrade === 'Perfect' && match.grade !== 'Perfect') continue;
      if (minGrade === 'Good' && match.grade === 'Stretch') continue;

      results.push({
        property: toPublicProperty(prop),
        score: match.score,
        grade: match.grade,
        reasons: match.reasons,
      });
    }

    // Sort descending by score
    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * Property -> Buyers: Find buyers waiting for this listing.
   */
  static async findBuyersForProperty(
    property: IProperty,
    userId: string,
    minGrade: 'all' | 'Good' | 'Perfect' = 'all',
    tolerancePct = 10
  ): Promise<BuyerMatchItem[]> {
    if (property.status !== 'available') {
      return [];
    }

    // Buyers whose max budget is within range
    const buyers = await Buyer.find({
      userId,
      status: 'active',
      purpose: property.purpose,
      isDeleted: false,
    });

    const results: BuyerMatchItem[] = [];

    for (const buyer of buyers) {
      const match = scoreMatch(property, buyer, tolerancePct);
      if (!match) continue;

      if (minGrade === 'Perfect' && match.grade !== 'Perfect') continue;
      if (minGrade === 'Good' && match.grade === 'Stretch') continue;

      results.push({
        buyer: {
          id: buyer._id.toString(),
          name: buyer.name,
          phoneE164: buyer.phoneE164,
          urgency: buyer.urgency,
          budget: buyer.budget,
        },
        score: match.score,
        grade: match.grade,
        reasons: match.reasons,
      });
    }

    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * Fast count of reverse matches when saving a new property ("N buyers waiting").
   */
  static async countReverseMatches(property: IProperty, userId: string): Promise<number> {
    const matches = await this.findBuyersForProperty(property, userId, 'all');
    return matches.length;
  }
}

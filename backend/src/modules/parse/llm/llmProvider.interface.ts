export interface RawExtractionOutput {
  itemType: 'listing' | 'buyer' | 'unknown';
  confidence: number;
  extracted: {
    property?: {
      type?: string;
      category?: 'Residential' | 'Commercial';
      purpose?: 'Sale' | 'Rent';
      locality?: string;
      city?: string;
      landmark?: string;
      sizeValue?: number;
      sizeUnit?: string;
      priceDemandPaise?: number;
      priceDemandRaw?: string;
      ownerName?: string;
      ownerPhone?: string;
      ownerNotes?: string;
      facing?: string;
      tags?: string[];
      description?: string;
    };
    buyer?: {
      name?: string;
      phone?: string;
      localities?: string[];
      anyLocality?: boolean;
      types?: string[];
      purpose?: 'Sale' | 'Rent';
      budgetMinPaise?: number;
      budgetMaxPaise?: number;
      budgetRaw?: string;
      sizeMinGaj?: number;
      sizeMaxGaj?: number;
      urgency?: 'hot' | 'warm' | 'cold';
      notes?: string;
    };
  };
  warnings?: string[];
}

export interface ParseMetadata {
  model: string;
  tokensIn?: number;
  tokensOut?: number;
  latencyMs: number;
  costEstimate?: number;
}

export interface ILLMProvider {
  parse(rawText: string): Promise<{ data: RawExtractionOutput; meta: ParseMetadata }>;
}


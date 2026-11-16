import type { ILLMProvider, RawExtractionOutput, ParseMetadata } from './llmProvider.interface.js';
import { detectHints } from '../regexHints.js';
import { parseInrToPaise } from '../../../utils/money.js';

export class RegexFallbackProvider implements ILLMProvider {
  async parse(rawText: string): Promise<{ data: RawExtractionOutput; meta: ParseMetadata }> {
    const start = Date.now();
    const hints = detectHints(rawText);

    // Determine type (listing vs buyer)
    const isBuyer =
      hints.itemTypeHint === 'buyer' ||
      /chahiye|requirement|req\b|client|buyer|looking for|need|chahie/i.test(rawText);

    let priceDemandPaise: number | undefined = undefined;
    if (hints.priceHintRaw) {
      try {
        priceDemandPaise = parseInrToPaise(hints.priceHintRaw);
      } catch {
        // Ignored
      }
    }

    // Locality detection (common Tier-2 localities in Panipat / NCR in English and Hindi)
    let locality: string | undefined = undefined;
    const knownLocalityPatterns: Array<{ name: string; regex: RegExp }> = [
      { name: 'Model Town', regex: /\bmodel\s*town\b|मॉडल\s*टाउन/i },
      { name: 'Sector 12', regex: /\bsector\s*12\b|सेक्टर\s*12|सेक्टर\s*१२/i },
      { name: 'Sector 18', regex: /\bsector\s*18\b|सेक्टर\s*18|सेक्टर\s*१८/i },
      { name: 'Sector 11', regex: /\bsector\s*11\b|सेक्टर\s*11|सेक्टर\s*११/i },
      { name: 'Sector 13', regex: /\bsector\s*13\b|सेक्टर\s*13|सेक्टर\s*१३/i },
      { name: 'Sector 25', regex: /\bsector\s*25\b|सेक्टर\s*25|सेक्टर\s*२५/i },
      { name: 'Sector 24', regex: /\bsector\s*24\b|सेक्टर\s*24|सेक्टर\s*२४/i },
      { name: 'Sector 6', regex: /\bsector\s*6\b|सेक्टर\s*6|सेक्टर\s*६/i },
      { name: 'Ansals', regex: /\bansal(?:s)?(?:\s*city)?\b|अंसल|सुशांत\s*सिटी/i },
      { name: 'Eldeco', regex: /\beldeco(?:\s*estate)?\b|एल्डेको/i },
      { name: 'TDI City', regex: /\btdi(?:\s*city)?\b|टीडीआई/i },
      { name: 'Chandni Bagh', regex: /\bchandni\s*bagh\b|चांदनी\s*बाग/i },
      { name: 'Sukhdev Nagar', regex: /\bsukhdev\s*nagar\b|सुखदेव\s*नगर/i },
      { name: 'Tehsil Camp', regex: /\btehsil\s*camp\b|तहसील\s*कैंप/i },
      { name: 'Sanoli Road', regex: /\bsanoli\s*road\b|सनौली\s*रोड/i },
      { name: 'Assandh Road', regex: /\bassandh\s*road\b|असंध\s*रोड/i },
      { name: 'GT Road', regex: /\bgt\s*road\b|जीटी\s*रोड/i },
      { name: 'Huda Sector', regex: /\bhuda\s*sector\b|हुडा\s*सेक्टर/i },
      { name: 'Bajaj Colony', regex: /\bbajaj\s*colony\b|बजाज\s*कॉलोनी/i },
    ];

    for (const item of knownLocalityPatterns) {
      if (item.regex.test(rawText)) {
        locality = item.name;
        break;
      }
    }

    // Property type (supports English and Hindi terms)
    let propertyType: string = 'Plot';
    if (/\bkothi\b|\bbungalow\b|\bhouse\b|\bvilla\b|कोठी|मकान|बंगला|घर/i.test(rawText)) {
      propertyType = 'Kothi';
    } else if (/\bfloor\b|\bbuilder floor\b|फ्लोर|बिल्डर\s*फ्लोर/i.test(rawText)) {
      propertyType = 'Floor';
    } else if (/\bflat\b|\bapartment\b|\b2bhk\b|\b3bhk\b|\b4bhk\b|फ्लैट|अपार्टमेंट/i.test(rawText)) {
      propertyType = 'Flat';
    } else if (/\bshop\b|\bshowroom\b|\bbooth\b|\bcommercial\b|दुकान|शोरूम|बूथ|कमर्शियल/i.test(rawText)) {
      propertyType = 'Shop';
    } else if (/प्लॉट|प्लाट|जमीन|\bplot\b/i.test(rawText)) {
      propertyType = 'Plot';
    }

    const purpose: 'Sale' | 'Rent' = hints.purposeHint || 'Sale';
    const category: 'Residential' | 'Commercial' = propertyType === 'Shop' ? 'Commercial' : 'Residential';

    let data: RawExtractionOutput;

    if (isBuyer) {
      data = {
        itemType: 'buyer',
        confidence: 0.85,
        extracted: {
          buyer: {
            name: 'Client',
            phone: undefined,
            localities: locality ? [locality] : [],
            anyLocality: !locality,
            types: [propertyType],
            purpose,
            budgetMaxPaise: priceDemandPaise,
            budgetMinPaise: priceDemandPaise ? Math.round(priceDemandPaise * 0.7) : undefined,
            budgetRaw: hints.priceHintRaw,
            sizeMinGaj: hints.sizeHint?.value,
            sizeMaxGaj: hints.sizeHint?.value ? Math.round(hints.sizeHint.value * 1.3) : undefined,
            urgency: 'warm',
            notes: rawText.slice(0, 200),
          },
        },
        warnings: hints.sizeHint ? [] : ['Could not extract exact size'],
      };
    } else {
      data = {
        itemType: 'listing',
        confidence: 0.9,
        extracted: {
          property: {
            type: propertyType,
            category,
            purpose,
            locality: locality || 'Panipat',
            city: 'Panipat',
            sizeValue: hints.sizeHint?.value,
            sizeUnit: hints.sizeHint?.unit || 'gaj',
            priceDemandPaise,
            priceDemandRaw: hints.priceHintRaw,
            description: rawText.slice(0, 300),
            tags: hints.keywords,
          },
        },
        warnings: hints.sizeHint ? [] : ['Could not extract exact size'],
      };
    }

    const latencyMs = Date.now() - start;
    const meta: ParseMetadata = {
      model: 'regex-fallback',
      tokensIn: 0,
      tokensOut: 0,
      latencyMs,
      costEstimate: 0,
    };

    return { data, meta };
  }
}

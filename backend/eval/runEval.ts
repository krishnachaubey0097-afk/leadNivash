import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RegexFallbackProvider } from '../src/modules/parse/llm/regexFallback.js';
import { GeminiProvider } from '../src/modules/parse/llm/geminiProvider.js';
import type { ILLMProvider } from '../src/modules/parse/llm/llmProvider.interface.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface SeedExample {
  id: string;
  rawText: string;
  expected: {
    itemType: 'listing' | 'buyer';
    type?: string;
    locality?: string;
    sizeGaj?: number;
    sizeMinGaj?: number;
    priceDemandPaise?: number;
    budgetMaxPaise?: number;
    purpose?: 'Sale' | 'Rent';
    phone?: string;
  };
}

export interface EvalFailure {
  id: string;
  field: string;
  expected: any;
  actual: any;
  rawText: string;
}

export interface EvalScorecard {
  mode: 'regex' | 'llm';
  split: 'tuning' | 'holdout' | 'all';
  total: number;
  itemTypeCorrect: number;
  typeCorrect: number;
  localityCorrect: number;
  priceCorrect: number;
  sizeCorrect: number;
  hallucinatedPhones: number;
  itemTypePct: number;
  typePct: number;
  localityPct: number;
  pricePct: number;
  sizePct: number;
  gatesPassed: boolean;
  failures: EvalFailure[];
}

export async function runEvaluation(
  optionsOrProvider:
    | ILLMProvider
    | {
        provider?: ILLMProvider;
        mode?: 'regex' | 'llm';
        split?: 'tuning' | 'holdout' | 'all';
      } = {}
): Promise<EvalScorecard> {
  const options =
    typeof (optionsOrProvider as any)?.parse === 'function'
      ? { provider: optionsOrProvider as ILLMProvider }
      : (optionsOrProvider as {
          provider?: ILLMProvider;
          mode?: 'regex' | 'llm';
          split?: 'tuning' | 'holdout' | 'all';
        });

  const mode = options.mode || (process.argv.includes('--llm') ? 'llm' : 'regex');
  const split = options.split || (process.argv.includes('--holdout') ? 'holdout' : process.argv.includes('--tuning') ? 'tuning' : 'all');

  let seeds: SeedExample[] = [];

  const tuningPath = path.resolve(__dirname, 'golden', 'seeds.tuning.json');
  const holdoutPath = path.resolve(__dirname, 'golden', 'seeds.holdout.json');

  if (split === 'tuning' && fs.existsSync(tuningPath)) {
    seeds = JSON.parse(fs.readFileSync(tuningPath, 'utf-8'));
  } else if (split === 'holdout' && fs.existsSync(holdoutPath)) {
    seeds = JSON.parse(fs.readFileSync(holdoutPath, 'utf-8'));
  } else {
    // Master or combined
    const tuningSeeds = fs.existsSync(tuningPath) ? JSON.parse(fs.readFileSync(tuningPath, 'utf-8')) : [];
    const holdoutSeeds = fs.existsSync(holdoutPath) ? JSON.parse(fs.readFileSync(holdoutPath, 'utf-8')) : [];
    seeds = [...tuningSeeds, ...holdoutSeeds];
  }

  const llm: ILLMProvider =
    options.provider ||
    (mode === 'llm' ? new GeminiProvider() : new RegexFallbackProvider());

  let itemTypeCorrect = 0;
  let typeCorrect = 0;
  let localityCorrect = 0;
  let priceCorrect = 0;
  let sizeCorrect = 0;
  let hallucinatedPhones = 0;
  const failures: EvalFailure[] = [];

  for (const seed of seeds) {
    const { data } = await llm.parse(seed.rawText);

    // 1. Classification (Listing/Buyer)
    if (data.itemType === seed.expected.itemType) {
      itemTypeCorrect++;
    } else {
      failures.push({
        id: seed.id,
        field: 'itemType',
        expected: seed.expected.itemType,
        actual: data.itemType,
        rawText: seed.rawText,
      });
    }

    // 2. Specific Property / Requirement Type
    const parsedType =
      data.itemType === 'listing'
        ? data.extracted.property?.type
        : data.extracted.buyer?.types?.[0];

    if (parsedType && seed.expected.type && parsedType.toLowerCase() === seed.expected.type.toLowerCase()) {
      typeCorrect++;
    } else if (seed.expected.type) {
      failures.push({
        id: seed.id,
        field: 'type',
        expected: seed.expected.type,
        actual: parsedType,
        rawText: seed.rawText,
      });
    }

    // 3. Locality accuracy
    const parsedLocality =
      data.itemType === 'listing'
        ? data.extracted.property?.locality
        : data.extracted.buyer?.localities?.[0];

    if (
      parsedLocality &&
      seed.expected.locality &&
      parsedLocality.toLowerCase().includes(seed.expected.locality.toLowerCase())
    ) {
      localityCorrect++;
    } else if (seed.expected.locality) {
      failures.push({
        id: seed.id,
        field: 'locality',
        expected: seed.expected.locality,
        actual: parsedLocality,
        rawText: seed.rawText,
      });
    }

    // 4. Price / Budget accuracy (within 10% tolerance)
    const expectedPrice = seed.expected.priceDemandPaise || seed.expected.budgetMaxPaise;
    const parsedPrice =
      data.itemType === 'listing'
        ? data.extracted.property?.priceDemandPaise
        : data.extracted.buyer?.budgetMaxPaise;

    if (expectedPrice && parsedPrice) {
      const diff = Math.abs(parsedPrice - expectedPrice) / expectedPrice;
      if (diff <= 0.1) {
        priceCorrect++;
      } else {
        failures.push({
          id: seed.id,
          field: 'priceDemandPaise / budgetMaxPaise',
          expected: expectedPrice,
          actual: parsedPrice,
          rawText: seed.rawText,
        });
      }
    } else if (!expectedPrice && !parsedPrice) {
      priceCorrect++;
    } else {
      failures.push({
        id: seed.id,
        field: 'priceDemandPaise / budgetMaxPaise',
        expected: expectedPrice,
        actual: parsedPrice,
        rawText: seed.rawText,
      });
    }

    // 5. Size accuracy (within 10% tolerance)
    const expectedSize = seed.expected.sizeGaj || seed.expected.sizeMinGaj;
    const parsedSize =
      data.itemType === 'listing'
        ? data.extracted.property?.sizeValue
        : data.extracted.buyer?.sizeMinGaj;

    if (expectedSize && parsedSize) {
      const diff = Math.abs(parsedSize - expectedSize) / expectedSize;
      if (diff <= 0.1) {
        sizeCorrect++;
      } else {
        failures.push({
          id: seed.id,
          field: 'sizeGaj / sizeMinGaj',
          expected: expectedSize,
          actual: parsedSize,
          rawText: seed.rawText,
        });
      }
    } else if (!expectedSize && !parsedSize) {
      sizeCorrect++;
    } else {
      if (seed.expected.itemType === 'buyer' && !expectedSize) {
        sizeCorrect++;
      } else {
        failures.push({
          id: seed.id,
          field: 'sizeGaj / sizeMinGaj',
          expected: expectedSize,
          actual: parsedSize,
          rawText: seed.rawText,
        });
      }
    }

    // 6. PRD Gate: Zero Hallucinated Phone Numbers
    const parsedPhone =
      data.itemType === 'listing'
        ? data.extracted.property?.ownerPhone
        : data.extracted.buyer?.phone;

    if (parsedPhone) {
      const digitsOnly = parsedPhone.replace(/\D/g, '').slice(-10);
      const textDigits = seed.rawText.replace(/\D/g, '');
      if (digitsOnly.length === 10 && !textDigits.includes(digitsOnly)) {
        hallucinatedPhones++;
        failures.push({
          id: seed.id,
          field: 'hallucinated_phone',
          expected: 'No hallucinated phone',
          actual: parsedPhone,
          rawText: seed.rawText,
        });
      }
    }
  }

  const total = seeds.length;
  const itemTypePct = Math.round((itemTypeCorrect / total) * 100);
  const typePct = Math.round((typeCorrect / total) * 100);
  const localityPct = Math.round((localityCorrect / total) * 100);
  const pricePct = Math.round((priceCorrect / total) * 100);
  const sizePct = Math.round((sizeCorrect / total) * 100);

  // PRD §7.7 Quality Gates:
  // 1. Classification >= 95%
  // 2. Locality >= 90%
  // 3. Price Normalization >= 95%
  // 4. Size Normalization >= 95%
  // 5. Zero Hallucinated Phone Numbers (Gate = 0)
  const gatesPassed =
    itemTypePct >= 95 &&
    localityPct >= 90 &&
    pricePct >= 95 &&
    sizePct >= 95 &&
    hallucinatedPhones === 0;

  return {
    mode,
    split,
    total,
    itemTypeCorrect,
    typeCorrect,
    localityCorrect,
    priceCorrect,
    sizeCorrect,
    hallucinatedPhones,
    itemTypePct,
    typePct,
    localityPct,
    pricePct,
    sizePct,
    gatesPassed,
    failures,
  };
}

// CLI runner
if (process.argv[1] && process.argv[1].endsWith('runEval.ts')) {
  const isLLM = process.argv.includes('--llm');
  const splitArg = process.argv.find((a) => a.startsWith('--split='));
  const split = splitArg ? (splitArg.split('=')[1] as 'tuning' | 'holdout' | 'all') : 'all';

  runEvaluation({ mode: isLLM ? 'llm' : 'regex', split })
    .then((res) => {
      console.log('\n=============================================================');
      console.log(`      LEADNIVESH EVALUATION HARNESS [${res.mode.toUpperCase()}] (${res.split.toUpperCase()} SPLIT)`);
      console.log('=============================================================');
      console.log(`Total Evaluated Seeds:       ${res.total}`);
      console.log(`1. Classification (Listing/Buyer): ${res.itemTypePct}% (Target: >=95%) ${res.itemTypePct >= 95 ? '✅ PASS' : '❌ FAIL'}`);
      console.log(`2. Property Sub-type:             ${res.typePct}%`);
      console.log(`3. Locality Extraction:           ${res.localityPct}% (Target: >=90%) ${res.localityPct >= 90 ? '✅ PASS' : '❌ FAIL'}`);
      console.log(`4. Price & Budget Normalization:  ${res.pricePct}% (Target: >=95%) ${res.pricePct >= 95 ? '✅ PASS' : '❌ FAIL'}`);
      console.log(`5. Size Normalization (Gaj):      ${res.sizePct}% (Target: >=95%) ${res.sizePct >= 95 ? '✅ PASS' : '❌ FAIL'}`);
      console.log(`6. Hallucinated Phone Gate:       ${res.hallucinatedPhones} hallucinated (Target: 0) ${res.hallucinatedPhones === 0 ? '✅ PASS' : '❌ FAIL'}`);
      console.log('-------------------------------------------------------------');
      console.log(`Overall Gate Criteria:       ${res.gatesPassed ? '🟢 ALL GATES PASSED' : '🔴 GATE FAILED'}`);
      console.log('=============================================================\n');

      if (res.failures.length > 0) {
        console.log(`Detailed Failures (${res.failures.length}):`);
        res.failures.forEach((f) => {
          console.log(`  - [${f.id}] Field: "${f.field}"`);
          console.log(`      Expected: ${JSON.stringify(f.expected)}`);
          console.log(`      Received: ${JSON.stringify(f.actual)}`);
          console.log(`      Raw Text: "${f.rawText}"\n`);
        });
      }

      if (!res.gatesPassed) {
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error('Eval harness failed:', err);
      process.exit(1);
    });
}

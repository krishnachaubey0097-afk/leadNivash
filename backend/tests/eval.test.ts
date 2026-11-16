import { describe, it, expect } from 'vitest';
import { runEvaluation } from '../eval/runEval.js';
import { RegexFallbackProvider } from '../src/modules/parse/llm/regexFallback.js';

describe('AI Parser Evaluation Suite (PRD §7.7 Quality Gates)', () => {
  it('meets or exceeds all accuracy thresholds on Appendix A golden seeds', async () => {
    // Run evaluation using deterministic offline fallback provider
    const results = await runEvaluation(new RegexFallbackProvider());

    expect(results.total).toBeGreaterThanOrEqual(20);
    expect(results.itemTypePct).toBeGreaterThanOrEqual(95); // Gate: >= 95%
    expect(results.localityPct).toBeGreaterThanOrEqual(90); // Gate: >= 90%
    expect(results.pricePct).toBeGreaterThanOrEqual(95); // Gate: >= 95%
    expect(results.sizePct).toBeGreaterThanOrEqual(95); // Gate: >= 95%
    expect(results.gatesPassed).toBe(true);
  });
});

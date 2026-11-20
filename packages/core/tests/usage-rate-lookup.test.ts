// usdRateFor is what the Usage pages in the extension and the IDE price
// tokens with. Both kept their own price lists until 20 Nov 2026 and both had
// drifted (the extension's knew five 2025 Qwen ids), so every model in use was
// priced by a guess. This holds the shared lookup to the catalogue.
import { describe, it, expect } from 'vitest';
import { usdRateFor } from '../src/audit/cost.js';
import { ALL_MODELS } from '../src/providers/catalog.js';

describe('usdRateFor — the Usage pages\' price lookup', () => {
  it('prices every model in the catalogue at its catalogue price', () => {
    for (const [provider, models] of Object.entries(ALL_MODELS)) {
      for (const m of models) {
        if (!m.pricing || m.disabled) continue;
        expect(usdRateFor(m.id), m.id).toEqual(m.pricing);
        expect(usdRateFor(`${provider}:${m.id}`), `${provider}:${m.id}`).toEqual(m.pricing);
        expect(usdRateFor(m.id, provider), `${m.id} on ${provider}`).toEqual(m.pricing);
      }
    }
  });

  it('reads managed -platform ids as the model they run', () => {
    expect(usdRateFor('kimi-k3-platform')).toEqual(usdRateFor('kimi-k3'));
    expect(usdRateFor('platform:deepseek-flash-platform')).toEqual(usdRateFor('deepseek-flash'));
  });

  it('says it does not know, rather than inventing a price', () => {
    expect(usdRateFor('my-local-llama')).toBeUndefined();
    expect(usdRateFor(undefined)).toBeUndefined();
    expect(usdRateFor('')).toBeUndefined();
  });
});

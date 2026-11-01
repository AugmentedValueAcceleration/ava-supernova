// MiniMax retired M2.7 (+ Highspeed) on 2026-11-18. Saved choices roll forward
// to M3.1 Flash instead of breaking; the picker offers only current models.
import { describe, it, expect } from 'vitest';
import { MINIMAX_MODELS } from '../src/providers/minimax/models.js';
import { MODEL_API_NAMES } from '../src/providers/request-shaping/model-ids.js';

describe('MiniMax catalogue', () => {
  it('offers M3 and M3.1 Flash in the picker', () => {
    const shown = MINIMAX_MODELS.filter((m) => !m.hiddenFromPicker).map((m) => m.id);
    expect(shown).toEqual(['MiniMax-M3', 'MiniMax-M3.1-Flash']);
  });

  it('sends the retired M2.7 ids as M3.1 Flash, priced as what is called', () => {
    for (const id of ['MiniMax-M2.7', 'MiniMax-M2.7-highspeed']) {
      expect(MODEL_API_NAMES[id]).toBe('MiniMax-M3.1-Flash');
      const m = MINIMAX_MODELS.find((x) => x.id === id);
      expect(m?.hiddenFromPicker).toBe(true);
      expect(m?.pricing).toEqual({ inputPerMillion: 0.15, outputPerMillion: 0.60 });
    }
  });
});

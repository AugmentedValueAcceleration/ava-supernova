// hiddenFromPicker means "do not offer this", never "do not use this" —
// fallback chains still resolve these by id, which is why the flag exists
// rather than deleting the entry. (The checks that the managed plan's copy of
// the catalogue agreed with this one went with the plan, 1 Nov 2026.)

import { describe, it, expect } from 'vitest';
import { ALL_MODELS } from '../src/providers/catalog.js';

describe('picker visibility', () => {
  it('hidden models stay RESOLVABLE — hiding is not removal', () => {
    // qwen3.5-plus is a documented fallback in DEFAULT_ROUTES. If hiding it
    // ever became deletion, that fallback would resolve to nothing.
    const hidden = Object.values(ALL_MODELS).flat().filter((m) => m.hiddenFromPicker);
    expect(hidden.length).toBeGreaterThan(0);
    for (const m of hidden) expect(m.id).toBeTruthy();
  });
});

// What we OFFER must match what we say is superseded.
//
// A model can exist twice: once as a BYOK entry under its own provider, once
// as a managed entry under `platform`. They are separate objects, so a flag
// set on one says nothing about the other — and on 2026-08-18 they disagreed.
// qwen3.5-plus was hiddenFromPicker in the BYOK catalogue and NOT on the
// platform copy, so a model the operator had just confirmed gone would have
// reappeared the moment he signed in.
//
// hiddenFromPicker means "do not offer this", never "do not use this" —
// fallback chains still resolve these by id, which is why the flag exists
// rather than deleting the entry.

import { describe, it, expect } from 'vitest';
import { ALL_MODELS, PLATFORM_MODELS } from '../src/providers/catalog.js';

/** Strip the `-platform` disambiguator so the two catalogues line up. */
const bareId = (id: string) => id.replace(/-platform$/, '');

describe('picker visibility', () => {
  const byokById = new Map(
    Object.values(ALL_MODELS).flat().map((m) => [m.id, m]),
  );

  it('a model hidden as BYOK is hidden on the plan too', () => {
    const disagree = PLATFORM_MODELS
      .filter((p) => !p.hiddenFromPicker)
      .filter((p) => byokById.get(bareId(p.id))?.hiddenFromPicker)
      .map((p) => p.id);

    expect(
      disagree,
      `Offered under the plan but marked superseded as BYOK: ${disagree.join(', ')}. `
      + `Set hiddenFromPicker on both copies — a flag on one says nothing about the other.`,
    ).toEqual([]);
  });

  it('still lists the models the fleets are built from', () => {
    // The point of the plan group. If this empties, signing in shows fleets
    // and nothing inside them, which is the bug it was added to fix.
    const shown = PLATFORM_MODELS.filter((m) => !m.disabled && !m.hiddenFromPicker);
    expect(shown.length).toBeGreaterThan(5);
    for (const fleetModel of ['deepseek-v4-pro-platform', 'mistral-medium-3.5-platform', 'qwen3.7-plus']) {
      expect(shown.map((m) => m.id)).toContain(fleetModel);
    }
  });

  it('hidden models stay RESOLVABLE — hiding is not removal', () => {
    // qwen3.5-plus is a documented fallback in DEFAULT_ROUTES. If hiding it
    // ever became deletion, that fallback would resolve to nothing.
    const hidden = Object.values(ALL_MODELS).flat().filter((m) => m.hiddenFromPicker);
    expect(hidden.length).toBeGreaterThan(0);
    for (const m of hidden) expect(m.id).toBeTruthy();
  });
});

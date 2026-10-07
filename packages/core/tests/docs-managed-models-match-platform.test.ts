import { describe, it, expect } from 'vitest';
import { PROVIDERS } from '../src/docs/data/providers.js';
import { PLATFORM_MODELS } from '../src/providers/platform/models.js';

/**
 * Every model the docs call PLATFORM-MANAGED must be in PLATFORM_MODELS, and
 * every model in PLATFORM_MODELS must be documented.
 *
 * WHY THIS TEST EXISTS
 *
 * PLATFORM_MODELS is the managed catalogue — the single models a signed-in plan
 * can actually select. The docs keep their own list for display, and on
 * 2026-10-07 it had drifted both ways at once:
 *
 *   listed but NOT managed   qwen3-coder-next, qwen3-coder-flash, qwen3.7-flash
 *   managed but NOT listed   qwen3.8-max
 *   listed but RETIRED       three mistral-*-platform ids, removed 2026-10-06
 *
 * Both directions are failures with teeth. A model listed here that a plan
 * cannot select is selling something we do not offer; one that is managed and
 * undocumented is hiding something we do. And these docs back `docs_lookup`, so
 * Ava answers "which models can I use?" out of them.
 *
 * The operator's instruction, verbatim: "always make sure it matches the
 * platform models".
 *
 * NOTE the deliberate asymmetry with the ORCHESTRATION entries. Those describe
 * fleets and name models like qwen3.7-flash that run the intent gate on a
 * user's behalf without ever being selectable. Served for you is not the same
 * as pickable by you, so only `kind: 'managed'` entries are checked here.
 */

const managedIds = () =>
  PROVIDERS.filter((p) => p.kind === 'managed').flatMap((p) => p.models.map((m) => m.id));

describe('docs managed models vs PLATFORM_MODELS', () => {
  it('finds managed entries at all, so the checks below mean something', () => {
    // A vacuous pass reads as coverage, which is worse than no test. If the
    // docs stop marking anything `managed`, that is itself the bug.
    expect(managedIds().length).toBeGreaterThanOrEqual(5);
    expect(PLATFORM_MODELS.length).toBeGreaterThanOrEqual(5);
  });

  it('documents nothing that a plan cannot actually select', () => {
    const real = new Set(PLATFORM_MODELS.map((m) => m.id));
    expect(managedIds().filter((id) => !real.has(id))).toEqual([]);
  });

  it('documents everything a plan CAN select', () => {
    const documented = new Set(managedIds());
    expect(PLATFORM_MODELS.map((m) => m.id).filter((id) => !documented.has(id))).toEqual([]);
  });

  it('never lists the same managed model twice', () => {
    // qwen3.8-flash appeared twice, identically, until 2026-10-07 — the shape a
    // careless paste leaves, and invisible in a rendered list of model cards.
    const ids = managedIds();
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect([...new Set(dupes)]).toEqual([]);
  });

  it('quotes the price the catalogue quotes', () => {
    const byId = new Map(PLATFORM_MODELS.map((m) => [m.id, m]));
    const wrong: string[] = [];
    for (const p of PROVIDERS.filter((x) => x.kind === 'managed')) {
      for (const m of p.models) {
        const real = byId.get(m.id);
        if (!real) continue; // covered by the test above
        if (m.inputPricePerM !== real.pricing.inputPerMillion) {
          wrong.push(`${m.id} input: docs ${m.inputPricePerM}, catalogue ${real.pricing.inputPerMillion}`);
        }
        if (m.outputPricePerM !== real.pricing.outputPerMillion) {
          wrong.push(`${m.id} output: docs ${m.outputPricePerM}, catalogue ${real.pricing.outputPerMillion}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });
});

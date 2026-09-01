// The BYOK audit rate card must agree with the model catalogues.
//
// PROVIDER_USD_RATES in src/audit/cost.ts is hand-maintained, and the
// catalogues in src/providers/<name>/models.ts are the source of truth for
// what a model costs. Nothing connected the two, so they drifted — and every
// form of drift was invisible by reading:
//
//   - three prices disagreed with the catalogue (qwen3.5-plus was double the
//     real input rate, qwen3.5-flash under-reported output by 2.7x, and
//     mistral-small-4 was low on both figures)
//   - six Anthropic ids sat in a provider block that had been deleted
//     everywhere else on 13 August
//   - three models had shipped to BYOK with no rate at all, so their turns
//     costed out at $0.00 — MiniMax until 2026-07-17, then Xiaomi and
//     Nemotron 3.5 Lightning until 2026-08-16
//
// All of it found on 2026-08-16 by diffing the two mechanically, none of it
// by looking. This test IS that diff, so the next divergence fails here
// instead of quietly under-reporting somebody's spend.
//
// It parses both sides out of source rather than importing them, because the
// rate card is a private const and the point is to check the file that ships.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..', 'src');

type Rate = [number, number];

/** provider -> id -> [inputPerMillion, outputPerMillion] from the audit card. */
function readRateCard(): Record<string, Record<string, Rate>> {
  const src = readFileSync(join(SRC, 'audit', 'cost.ts'), 'utf8');
  const body = src.match(/PROVIDER_USD_RATES[^=]*=\s*\{([\s\S]*?)\n\};/)?.[1];
  if (!body) throw new Error('could not locate PROVIDER_USD_RATES — did the shape change?');

  const out: Record<string, Record<string, Rate>> = {};
  let provider: string | null = null;
  for (const line of body.split('\n')) {
    const p = line.match(/^\s{2}(\w+):\s*\{/);
    if (p) { provider = p[1]; out[provider] = {}; continue; }
    const m = line.match(/'([^']+)':\s*\{\s*inputPerMillion:\s*([\d.]+),\s*outputPerMillion:\s*([\d.]+)/);
    if (m && provider) out[provider][m[1]] = [parseFloat(m[2]), parseFloat(m[3])];
  }
  return out;
}

/** provider -> id -> [inputPerMillion, outputPerMillion] from the catalogues. */
function readCatalogues(): Record<string, Record<string, Rate>> {
  const out: Record<string, Record<string, Rate>> = {};
  for (const dir of readdirSync(join(SRC, 'providers'))) {
    const file = join(SRC, 'providers', dir, 'models.ts');
    if (!existsSync(file)) continue;
    const src = readFileSync(file, 'utf8');
    out[dir] = {};
    const re = /id:\s*'([^']+)'[\s\S]*?pricing:\s*\{\s*inputPerMillion:\s*([\d.]+),\s*outputPerMillion:\s*([\d.]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) out[dir][m[1]] = [parseFloat(m[2]), parseFloat(m[3])];
  }
  return out;
}

// UNREACHABLE — retained only so existing receipts still cost out.
//
// None of these is in any catalogue, so nothing can select one and no new
// call can produce one. The rates stay purely so audit entries recorded while
// they WERE live keep their real cost instead of silently restating as free.
// That is the whole justification; it is not a general "never delete a rate"
// policy, and it does not extend to a model that is merely hidden.
//
// Hidden-but-reachable is a different case and must NOT go in here —
// kimi-k2.6 and qwen3.5-plus are off the picker but still reachable by
// routing and fallback, so they can produce new charges and are required
// above like any offered model.
//
// Adding an entry means: this model is gone, but its receipts are not.
const UNREACHABLE_KEPT_FOR_RECEIPTS = new Set([
  'kimi/kimi-k2.5',      // dropped ahead of Moonshot's 31 August switch-off
  'qwen/qwen3.7-max',    // retired 2026-08-09 in favour of 3.8 Max
  'tencent/hy3-preview', // April preview, replaced by the GA hy3
  'zhipu/glm-5.2',       // retired 2026-09-01 for GLM-5.3, same price
  'zhipu/glm-4.5-air',   // retired 2026-09-01; 5.3 Flash is the light tier now
]);

// The platform catalogue is not a BYOK provider — platform turns bill in
// credits through creditsForTurn(), never through the USD rate card, so its
// ids are not expected here.
const NOT_A_BYOK_PROVIDER = new Set(['platform']);

// Models that CANNOT have a rate, rather than ones missing a rate.
// `generic/custom` is whatever endpoint the user points it at, so there is no
// published price to record and a made-up one would be worse than none.
const NO_PUBLISHED_PRICE = new Set(['generic/custom']);

describe('BYOK audit rate card', () => {
  const card = readRateCard();
  const cat = readCatalogues();

  it('parses both sides (guards the regexes themselves)', () => {
    // If a refactor breaks the parsing, every other assertion below passes
    // vacuously — which would be worse than failing, because it would look
    // like agreement. These floors make that impossible.
    expect(Object.keys(card).length).toBeGreaterThan(5);
    expect(Object.keys(cat).length).toBeGreaterThan(5);
    expect(Object.values(cat).some(m => Object.keys(m).length > 0)).toBe(true);
  });

  it('quotes the same price as the catalogue for every shared id', () => {
    const wrong: string[] = [];
    for (const [provider, models] of Object.entries(card))
      for (const [id, [input, output]] of Object.entries(models)) {
        const truth = cat[provider]?.[id];
        if (!truth) continue;
        if (truth[0] !== input || truth[1] !== output)
          wrong.push(`${provider}/${id}: rate card $${input}/$${output} vs catalogue $${truth[0]}/$${truth[1]}`);
      }
    expect(wrong).toEqual([]);
  });

  it('carries no id that no catalogue defines, unless kept for receipts', () => {
    const dead: string[] = [];
    for (const [provider, models] of Object.entries(card))
      for (const id of Object.keys(models)) {
        const key = `${provider}/${id}`;
        if (!cat[provider]?.[id] && !UNREACHABLE_KEPT_FOR_RECEIPTS.has(key)) dead.push(key);
      }
    expect(dead).toEqual([]);
  });

  it('prices every model a catalogue offers, so no BYOK turn costs out at nothing', () => {
    // This is the direction that loses money quietly. A missing rate used to
    // render as "$0.00" rather than "—", so an unpriced model was
    // indistinguishable from a free one.
    const unpriced: string[] = [];
    for (const [provider, models] of Object.entries(cat)) {
      if (NOT_A_BYOK_PROVIDER.has(provider)) continue;
      for (const id of Object.keys(models)) {
        const key = `${provider}/${id}`;
        if (!card[provider]?.[id] && !NO_PUBLISHED_PRICE.has(key)) unpriced.push(key);
      }
    }
    expect(unpriced).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { modelCostMultiplier } from '../src/billing/credits.js';

/**
 * The credit multipliers quoted in the docs must match the ones that charge.
 *
 * WHY THIS TEST EXISTS
 *
 * The credits PAGE reads the multiplier straight out of the pricing table, so
 * it cannot lie. The DOCS hand-write the same numbers into prose, and on
 * 2026-09-10 five of eleven had drifted:
 *
 *   Mistral Medium 3.5   docs 3.12x   actual 3.87x
 *   Qwen 3.8 Max         docs 2.58x   actual 1.36x
 *   Qwen 3.7 Plus        docs 0.82x   actual 0.94x
 *   DeepSeek             docs 1.35x   actual 0.44x   (and listed TWICE, once
 *                                      at each value, after a rename)
 *   Qwen 3.5 Flash       docs 0.22x   actual 0.16x
 *
 * Two models were missing entirely and two retired ones were still priced.
 * Nobody noticed because nothing checked. These docs also back `docs_lookup`,
 * so Ava answers billing questions out of them — a wrong number here is a
 * wrong answer given confidently.
 *
 * The test reads the prose rather than asking anyone to remember. Change a
 * multiplier and this fails until the docs say the same thing.
 */

const CONCEPTS = join(__dirname, '..', 'src', 'docs', 'content', 'concepts.ts');

/** Display names as written in the docs -> the id that gets charged. */
const NAME_TO_ID: Record<string, string> = {
  'Kimi K3': 'kimi-k3',
  'Kimi K2.7 Code': 'kimi-k2.7-code',
  'Mistral Medium 3.5': 'mistral-medium-3.5',
  'Mistral Large 3': 'mistral-large-3',
  'Mistral Small 4': 'mistral-small-4',
  'Qwen 3.7 Max': 'qwen3.7-max',
  'Qwen 3.8 Max': 'qwen3.8-max',
  'Qwen 3.7 Plus': 'qwen3.7-plus',
  'Qwen 3.8 Flash': 'qwen3.8-flash',
  'Qwen 3.7 Flash': 'qwen3.7-flash',
  'Qwen 3.5 Plus': 'qwen3.5-plus',
  'Qwen 3.5 Flash': 'qwen3.5-flash',
  'DeepSeek V4.1 Flash': 'deepseek-flash',
};

/**
 * A priced bullet: "0.44× — Some Model, Another Model. Prose...".
 *
 * Split on /\r?\n/ rather than '\n'. These files are CRLF, and a bare '\n'
 * split leaves a trailing \r on every line — JS treats \r as a line
 * terminator, so `.` refuses to cross it and `(.*)$` can never reach the end
 * of the string. Split the wrong way, this matched NOTHING, silently.
 */
function pricedBullets(): Array<{ value: number; rest: string }> {
  const src = readFileSync(CONCEPTS, 'utf8');
  const out: Array<{ value: number; rest: string }> = [];
  for (const line of src.split(/\r?\n/)) {
    const m = line.match(/'(\d+\.\d+)×\s+—\s+(.*)$/);
    if (m) out.push({ value: Number(m[1]), rest: m[2] });
  }
  return out;
}

/** Every (model, multiplier) pair the docs actually assert. */
function quotedMultipliers(): Array<{ value: number; name: string }> {
  const out: Array<{ value: number; name: string }> = [];
  for (const { value, rest } of pricedBullets()) {
    for (const name of Object.keys(NAME_TO_ID)) {
      if (rest.includes(name)) out.push({ value, name });
    }
  }
  return out;
}

describe('docs credit multipliers', () => {
  // Guards the checks below from passing vacuously. An earlier draft stopped
  // its match at the first full stop, which breaks on "Qwen 3.7 Plus", found
  // 3 of 13 bullets and went green — a matching test that checks almost
  // nothing is worse than no test, because it reads as coverage.
  it('finds the bullets at all, so the checks below mean something', () => {
    expect(pricedBullets().length).toBeGreaterThanOrEqual(10);
    expect(quotedMultipliers().length).toBeGreaterThanOrEqual(10);
  });

  it('matches the table that actually charges', () => {
    const mismatches = quotedMultipliers()
      .filter(({ value, name }) => modelCostMultiplier(NAME_TO_ID[name]) !== value)
      .map(({ value, name }) =>
        `${name}: docs say ${value}x, billing charges ${modelCostMultiplier(NAME_TO_ID[name])}x`);

    expect(mismatches).toEqual([]);
  });

  it('never quotes one model at two different multipliers', () => {
    const byName = new Map<string, Set<number>>();
    for (const { value, name } of quotedMultipliers()) {
      if (!byName.has(name)) byName.set(name, new Set());
      byName.get(name)!.add(value);
    }
    // This is the shape a model rename leaves behind: two bullets that used to
    // name different models now name the same one, each at its old price.
    const doubled = [...byName.entries()]
      .filter(([, values]) => values.size > 1)
      .map(([name, values]) => `${name} quoted at ${[...values].join('x and ')}x`);

    expect(doubled).toEqual([]);
  });

  it('does not PRICE a model that no longer exists', () => {
    const retired = ['Qwen 3.5 Omni Flash', 'Qwen 3.5 Omni Plus', 'V4 Pro', 'V4 Flash'];

    // Retired names may still appear in prose. "It fell from 1.35x when
    // DeepSeek retired V4 Pro into V4.1 Flash" is the sentence that explains
    // the change, and deleting it would throw away the history. What must not
    // happen is a dead model being quoted a PRICE, so only bullets are checked.
    // Only the HEAD of the bullet — the model list before the first sentence
    // break — names what is being priced. Splitting on ". " is safe because
    // model names put digits after their dots ("V4.1", "3.7"), never a space.
    const priced = pricedBullets().flatMap(({ value, rest }) => {
      const head = rest.split('. ')[0];
      return retired.filter((r) => head.includes(r)).map((r) => `${r} priced at ${value}x`);
    });

    expect(priced).toEqual([]);

    // The Omni models have no such excuse — nothing refers to them any more.
    const src = readFileSync(CONCEPTS, 'utf8');
    expect(['Qwen 3.5 Omni Flash', 'Qwen 3.5 Omni Plus'].filter((r) => src.includes(r))).toEqual([]);
  });
});

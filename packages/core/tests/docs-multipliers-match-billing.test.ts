import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The docs must NOT restate per-model credit multipliers.
 *
 * WHAT THIS TEST USED TO DO, AND WHY IT CHANGED
 *
 * It used to read the multipliers out of the prose and compare them with the
 * billing table, because the docs hand-wrote the same numbers and on
 * 2026-09-10 five of eleven had drifted:
 *
 *   Mistral Medium 3.5   docs 3.12x   actual 3.87x
 *   Qwen 3.8 Max         docs 2.58x   actual 1.36x
 *   Qwen 3.7 Plus        docs 0.82x   actual 0.94x
 *   DeepSeek             docs 1.35x   actual 0.44x   (listed TWICE after a rename)
 *   Qwen 3.5 Flash       docs 0.22x   actual 0.16x
 *
 * On 2026-10-07 the list came out altogether. One of its bullets was anchored
 * on "Mistral Medium 3.5 — this is the model the whole table is calibrated
 * against", a fleet lead we had stopped serving the day before; the drift was
 * not a stale number but a stale premise, which no comparison would have
 * caught. avasupernova.com/credits reads the multipliers from the live billing
 * table and cannot lie, so the live numbers now have exactly one home.
 *
 * Checking a copy is weaker than not having a copy. This test therefore guards
 * the stronger property: that the copy stays gone. These docs back
 * `docs_lookup`, so Ava answers billing questions out of them — a number
 * reintroduced here is a wrong answer given confidently, later.
 */

const CONCEPTS = join(__dirname, '..', 'src', 'docs', 'content', 'concepts.ts');
const src = () => readFileSync(CONCEPTS, 'utf8');

/**
 * A priced bullet: "0.44× — Some Model. Prose...".
 *
 * Split on /\r?\n/ rather than '\n'. These files are CRLF, and a bare '\n'
 * split leaves a trailing \r on every line — JS treats \r as a line
 * terminator, so `.` refuses to cross it and `(.*)$` can never reach the end of
 * the string. Split the wrong way, this matches NOTHING, silently.
 */
function pricedBullets(): Array<{ value: number; rest: string }> {
  const out: Array<{ value: number; rest: string }> = [];
  for (const line of src().split(/\r?\n/)) {
    const m = line.match(/'(\d+(?:\.\d+)?)×\s+—\s+(.*)$/);
    if (!m) continue;
    // "1.0× — any model without a listed multiplier" is a RULE, not a copied
    // figure: it names no model and cannot drift, because there is nothing in
    // the billing table for it to disagree with. Everything else states a
    // number for a named model, which is the thing that drifts.
    if (/any model without a listed multiplier/i.test(m[2])) continue;
    out.push({ value: Number(m[1]), rest: m[2] });
  }
  return out;
}

describe('docs credit multipliers', () => {
  it('does not quote per-model multipliers — the credits page owns them', () => {
    const quoted = pricedBullets().map(({ value, rest }) => `${value}× — ${rest.slice(0, 60)}`);

    // If this fails, someone has hand-copied the billing table back into the
    // prose. Delete the numbers rather than correcting them: they drift, and
    // the drift is invisible to a reader. 1.0× is excluded below because it is
    // a rule ("anything unlisted"), not a copied figure.
    expect(quoted).toEqual([]);
  });

  it('still explains what a multiplier IS, so removing the numbers cost no meaning', () => {
    const text = src();
    expect(text).toContain('Per-model multipliers');
    expect(text).toMatch(/1\.0× — any model without a listed multiplier/);
  });

  it('sends the reader to the one place the live numbers exist', () => {
    expect(src()).toContain('avasupernova.com/credits');
  });

  it('does not PRICE a model that no longer exists', () => {
    const retired = ['Qwen 3.5 Omni Flash', 'Qwen 3.5 Omni Plus', 'V4 Pro', 'V4 Flash'];

    // Retired names may still appear in prose. "It fell from 1.35x when
    // DeepSeek retired V4 Pro into V4.1 Flash" is the sentence that explains
    // the change, and deleting it would throw away the history. What must not
    // happen is a dead model being quoted a PRICE.
    const priced = pricedBullets().flatMap(({ value, rest }) => {
      const head = rest.split('. ')[0];
      return retired.filter((r) => head.includes(r)).map((r) => `${r} priced at ${value}x`);
    });
    expect(priced).toEqual([]);

    // The Omni models have no such excuse — nothing refers to them any more.
    expect(['Qwen 3.5 Omni Flash', 'Qwen 3.5 Omni Plus'].filter((r) => src().includes(r))).toEqual([]);
  });

  it('does not describe the fleets that went dark on 2026-10-06', () => {
    // Aurora and Longxiang are not offered. The docs sold them until this date:
    // a three-column comparison table, a "pick one of three styles" chooser,
    // and provider entries for both. The gate is in auto/routing-modes.ts; this
    // check is here because documentation drifts separately from code and has
    // its own translations, nineteen of them, to drag along behind it.
    const text = src();
    expect(text).not.toMatch(/Aurora/);
    expect(text).not.toMatch(/Longxiang/);
  });
});

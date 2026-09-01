// The rules that stop a runaway turn must actually be in the prompt.
//
// These three exist because of behaviour seen in real use: on "stop" she
// acknowledged and kept working in prose, and on errors she retried the same
// approach indefinitely. Both were structural — rule 10 forbade continuing to
// ACT while rule 13 demanded closing text and 8/9 pushed that text toward the
// solution; rule 7 prescribed a different ACTION and never a stop, and 3/8/9
// left no legal exit from a stuck state.
//
// A prompt rule has no compiler. Nothing fails if someone reworks this section
// and the escape hatch quietly goes with it — the model just goes back to
// looping, and it looks like a model problem rather than a missing sentence.
// So the load-bearing halves are asserted here: not the wording, which should
// stay free to improve, but the specific commitments that make stopping
// possible at all.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../src/agent/system-prompt.ts'), 'utf8');

describe('stop actually stops', () => {
  it('names prose as a way of continuing', () => {
    // The whole failure: tools halted, talking carried on, and from the user's
    // side there was no difference.
    expect(src).toMatch(/including in prose/i);
    expect(src).toMatch(/Continuing to work THROUGH TALKING is still continuing/);
  });

  it('specifies the only permitted reply rather than only forbidding things', () => {
    // A prohibition with no permitted alternative gets filled with whatever
    // looks most useful, which is the solution.
    expect(src).toMatch(/ONLY permitted reply is one line/);
    expect(src).toMatch(/No diagnosis, no next step, no options/);
  });

  it('exempts a stop from the always-close-out rule', () => {
    // Otherwise rule 13 is a licence to add a paragraph after being told to stop.
    expect(src).toMatch(/after a stop, the single line IS the close-out/);
  });
});

describe('a loop has a floor', () => {
  it('measures a loop by diagnosis, not by attempt count', () => {
    // The third attempt never feels like the third; it feels like finally
    // understanding the error. "What is different this time" is the question
    // that cannot be answered dishonestly.
    expect(src).toMatch(/measured by DIAGNOSIS, not by count/);
    expect(src).toMatch(/the same hypothesis in new words is the same attempt/);
  });

  it('gives a stopping point and a report, not just another action', () => {
    expect(src).toMatch(/THIRD failure on the same error: stop and report/);
    expect(src).toMatch(/the error text verbatim, what you tried, and what you need decided/);
  });

  it('says the report does not violate the momentum rules', () => {
    // Without this the model has no legal exit and takes the least-bad
    // illegal one, which is to keep going.
    // The source escapes its quotes, so match the parts either side of them
    // rather than the escaping — the wording should stay free to change.
    expect(src).toMatch(/That report is not/);
    expect(src).toMatch(/\(rule 3\) and not suggesting a pause \(rule 9\)/);
  });
});

describe('reading is not running', () => {
  it('separates traced-and-looks-right from seen-to-work', () => {
    expect(src).toMatch(/Reading the code is not watching it work/);
    expect(src).toMatch(/the value can die at the one call site you did not open/);
  });

  it('gives the honest phrasing to use when it has not been observed', () => {
    expect(src).toMatch(/the code looks right, I have not seen it run/);
  });
});

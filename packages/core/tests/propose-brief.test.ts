// Phase 2: every post gets a brief, agreed before it is written.
//
// 20 Oct 2026, the operator: "I want a discussion to happen before the
// creation, so we decide together the vision of the post — that's a
// marketing partner."

import { describe, it, expect } from 'vitest';
import { ProposeBriefTool } from '../src/tools/propose-brief.js';
import { PRODUCING_TOOLS, talkingToolsFor } from '../src/agent/agent.js';
import type { PostBrief } from '../src/social/index.js';

const full = {
  subject: 'local memory that survives a reinstall',
  argues: 'your agent should remember you, not your vendor',
  audience: 'a dev who lost a month of context when a SaaS tool shut down',
  angle: 'the reinstall test',
  form: 'single post — the claim reads better than it films',
  mustLand: 'Uninstall it. Reinstall it. It still knows you.',
  reasoning: 'I considered a demo clip, but the point is a principle, and the test is vivid enough in words.',
};

describe('propose_brief', () => {
  it('hands a complete brief to the store', async () => {
    let got: PostBrief | null = null;
    const ctx = { cwd: '.', sharedState: { briefStore: { propose: async (b: PostBrief) => { got = b; } } } } as never;
    const r = await new ProposeBriefTool().execute(full, ctx);
    expect(r.success).toBe(true);
    expect(got).toMatchObject({ mustLand: full.mustLand, audience: full.audience });
  });

  // A brief with a hole is the vague brief this replaces.
  it('names what is missing rather than accepting a hole', async () => {
    const ctx = { cwd: '.', sharedState: { briefStore: { propose: async () => {} } } } as never;
    const r = await new ProposeBriefTool().execute({ ...full, audience: '  ', reasoning: '' }, ctx);
    expect(r.success).toBe(false);
    expect(r.output).toMatch(/who it is for/);
    expect(r.output).toMatch(/your reasoning/);
  });

  it('says so when the surface has no store', async () => {
    const r = await new ProposeBriefTool().execute(full, { cwd: '.', sharedState: {} } as never);
    expect(r.success).toBe(false);
    expect(r.output).toMatch(/briefStore/);
  });

  // A brief is discussed in a talking turn, so it must survive one.
  it('is not a producing tool, so talking mode keeps it', () => {
    expect(PRODUCING_TOOLS.has('propose_brief')).toBe(false);
    expect(talkingToolsFor(new Set(['propose_brief', 'write_post'])).has('propose_brief')).toBe(true);
  });
});

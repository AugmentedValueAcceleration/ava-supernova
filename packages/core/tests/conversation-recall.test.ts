import { describe, it, expect } from 'vitest';
import { ConversationRecallTool } from '../src/tools/conversation-recall.js';
import type { Message } from '../src/core/types.js';

const tool = new ConversationRecallTool();

// A small transcript stashed the way Agent.run does it.
const transcript: Message[] = [
  { role: 'system', content: 'You are Ava.' },
  { role: 'user', content: 'The Supabase token is sbp_live_abc and it rotates daily.' },
  { role: 'assistant', content: 'Understood — I will not echo it.' },
  { role: 'user', content: 'Build the mood tracker with a calendar view.' },
  { role: 'assistant', content: 'Done — wrote MoodTracker.tsx and wired the calendar.' },
  // Our own scaffolding — must be ignored by recall.
  { role: 'user', content: '[CONTEXT WAS COMPRESSED. RESUME YOUR CURRENT TASK.]' },
];

const ctx = (over: Record<string, unknown> = {}) => ({
  cwd: '/test',
  sharedState: { recallTranscript: transcript },
  ...over,
});

describe('ConversationRecallTool', () => {
  it('is a safe, trusted, no-confirm tool', () => {
    expect(tool.name).toBe('conversation_recall');
    expect(tool.riskLevel).toBe('safe');
    expect(tool.outputTrust).toBe('trusted');
    expect(tool.requiresConfirmation).toBe(false);
  });

  it('requires a query', async () => {
    const r = await tool.execute({}, ctx());
    expect(r.success).toBe(false);
  });

  it('finds an earlier user statement by keyword', async () => {
    const r = await tool.execute({ query: 'supabase token' }, ctx());
    expect(r.success).toBe(true);
    expect(r.output).toContain('sbp_live_abc');
    expect(r.output).toContain('User');
  });

  it('reports how far back a match is', async () => {
    const r = await tool.execute({ query: 'calendar' }, ctx());
    expect(r.output).toMatch(/message\(s\) back/);
  });

  it('ignores compression scaffolding messages', async () => {
    const r = await tool.execute({ query: 'compressed resume task' }, ctx());
    // The only message containing those words is our meta-injection — must not surface.
    expect(r.output).not.toContain('CONTEXT WAS COMPRESSED');
  });

  it('returns a clean miss when nothing matches', async () => {
    const r = await tool.execute({ query: 'kubernetes helm chart' }, ctx());
    expect(r.success).toBe(true);
    expect(r.output.toLowerCase()).toContain('nothing');
  });

  it('handles an absent transcript gracefully', async () => {
    const r = await tool.execute({ query: 'anything' }, { cwd: '/test', sharedState: {} });
    expect(r.success).toBe(true);
    expect(r.output.toLowerCase()).toContain('no earlier conversation');
  });

  it('respects max_results', async () => {
    const r = await tool.execute({ query: 'the', max_results: 1 }, ctx());
    // "showing 1" appears in the header when capped.
    expect(r.output).toMatch(/showing 1\)/);
  });
});

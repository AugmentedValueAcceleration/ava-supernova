import { describe, it, expect, beforeEach } from 'vitest';
import { avaEvents, withTrajectory } from '../src/dataset/emitter.js';
import type { AvaEvent } from '../src/dataset/events.js';
import { eventToDataset } from '../src/dataset/routing.js';
import { categorizeToolPurpose } from '../src/dataset/summarizers.js';

const baseCtx = {
  session_id: 'sess-1',
  surface: 'cli' as const,
  mode: 'work' as const,
  model_id: 'qwen3.7-plus',
};

async function flushMicrotasks(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}

describe('Phase 1 dataset signals — routing', () => {
  it('routes persona_veto into persona-handoffs', () => {
    expect(eventToDataset('persona_veto')).toBe('persona-handoffs');
  });
  it('routes verification_evidence into verification-pairs', () => {
    expect(eventToDataset('verification_evidence')).toBe('verification-pairs');
  });
});

describe('categorizeToolPurpose', () => {
  it('marks read-only verify tools as verification', () => {
    expect(categorizeToolPurpose('grep')).toBe('verification');
    expect(categorizeToolPurpose('file_read')).toBe('verification');
    expect(categorizeToolPurpose('git_diff')).toBe('verification');
  });
  it('classifies edits, commits, execution, generation', () => {
    expect(categorizeToolPurpose('file_edit')).toBe('targeted-edit');
    expect(categorizeToolPurpose('git_commit')).toBe('commit-op');
    expect(categorizeToolPurpose('bash')).toBe('execution');
    expect(categorizeToolPurpose('generate_image')).toBe('generation');
  });
  it('recovering overrides everything else', () => {
    // Even a verify tool reads as recovery when it follows a failure.
    expect(categorizeToolPurpose('grep', { recovering: true })).toBe('recovery');
    expect(categorizeToolPurpose('file_edit', { recovering: true })).toBe('recovery');
  });
  it('falls back to action for unknown tools', () => {
    expect(categorizeToolPurpose('some_new_tool')).toBe('action');
  });
});

describe('Phase 1 dataset signals — emit shape (no raw text)', () => {
  beforeEach(() => {
    avaEvents.clearAllHandlers();
  });

  it('persona_veto carries category + word count, never raw reason', async () => {
    const received: AvaEvent[] = [];
    avaEvents.onAll((e) => received.push(e));

    withTrajectory(baseCtx, () => {
      avaEvents.emit('persona_veto', {
        vetoing_persona: 'challenger',
        veto_category: 'approach-flaw',
        reason_word_count: 7,
      });
    });

    await flushMicrotasks();
    expect(received).toHaveLength(1);
    const p = received[0].payload as any;
    expect(received[0].event_type).toBe('persona_veto');
    expect(p.vetoing_persona).toBe('challenger');
    expect(p.veto_category).toBe('approach-flaw');
    expect(typeof p.reason_word_count).toBe('number');
    // Shape-only: the only string fields are the persona id and a fixed category.
    expect(Object.keys(p).sort()).toEqual(['reason_word_count', 'veto_category', 'vetoing_persona']);
  });

  it('verification_evidence is counts + booleans only', async () => {
    const received: AvaEvent[] = [];
    avaEvents.onAll((e) => received.push(e));

    withTrajectory(baseCtx, () => {
      avaEvents.emit('verification_evidence', {
        verify_tool_calls: 3,
        verify_tool_successes: 2,
        distinct_verify_tools: 2,
        verified_before_response: true,
        claim_flagged: false,
      });
    });

    await flushMicrotasks();
    expect(received).toHaveLength(1);
    const p = received[0].payload as any;
    expect(received[0].event_type).toBe('verification_evidence');
    expect(p.verify_tool_calls).toBe(3);
    expect(p.verify_tool_successes).toBe(2);
    expect(p.verified_before_response).toBe(true);
    expect(p.claim_flagged).toBe(false);
    // Every field is a number or boolean — nothing that could carry user text.
    for (const v of Object.values(p)) {
      expect(['number', 'boolean']).toContain(typeof v);
    }
  });
});

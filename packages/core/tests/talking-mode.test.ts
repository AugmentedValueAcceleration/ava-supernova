// Phase 1: she can talk without producing.
//
// 20 Oct 2026, the operator, having raised it for months: *"why is it when i
// try talking about a mistake she just creates — so you telling me she is
// unable to just talk and know when talking is needed over working?"*
//
// She was not being wilful. The only gate she had chose how MUCH machinery to
// spin up, never whether to act at all; a complaint is grammatically identical
// to a request; the room's prefix is a working prefix; and the tools are
// always on the table. Producing was the only move the shape of the system
// afforded. So this is a STATE, not an instruction — "please discuss rather
// than act" is a suggestion competing against all of that, and removing the
// tools is not.

import { describe, it, expect } from 'vitest';
import {
  PRODUCING_TOOLS,
  TALKING_MODE_SUFFIX,
  talkingToolsFor,
  toolPassesModeGate,
} from '../src/agent/agent.js';

/** A rough stand-in for the social room: things that make, things that look. */
const SOCIAL = new Set([
  'write_post', 'write_video_post', 'write_post_image', 'write_voiceover',
  'check_posts', 'web_search', 'memory_recall', 'suggest_beats',
  'find_recipe', 'day_plan_read', 'ask_user',
]);

describe('talking mode takes away the making', () => {
  it('withholds every producing tool', () => {
    const talking = talkingToolsFor(SOCIAL);
    for (const t of PRODUCING_TOOLS) {
      expect(talking.has(t), `${t} should be withheld`).toBe(false);
    }
  });

  // A discussion in which she cannot look anything up is not a discussion,
  // it is a guess.
  it('keeps everything that reads, searches or checks', () => {
    const talking = talkingToolsFor(SOCIAL);
    for (const t of ['check_posts', 'web_search', 'memory_recall', 'find_recipe', 'day_plan_read', 'ask_user']) {
      expect(talking.has(t), `${t} should survive`).toBe(true);
    }
  });

  // The likeliest reason to be talking at all is that something did not get
  // made. Losing the one tool that can confirm it would be perverse.
  it('keeps check_posts above all', () => {
    expect(talkingToolsFor(SOCIAL).has('check_posts')).toBe(true);
  });

  it('leaves the working room untouched', () => {
    expect(SOCIAL.has('write_post')).toBe(true);
    expect(talkingToolsFor(SOCIAL)).not.toBe(SOCIAL);
  });
});

describe('the gate enforces it, not just the schema list', () => {
  // toolPassesModeGate is the single predicate for BOTH the schema filter and
  // the call-side block, so a withheld tool cannot be offered and then
  // refused — nor sneak through by being called without being offered.
  it('refuses a producing tool that was withheld', () => {
    const talking = talkingToolsFor(SOCIAL);
    expect(toolPassesModeGate('write_post', talking)).toBe(false);
    expect(toolPassesModeGate('write_video_post', talking)).toBe(false);
  });

  it('still passes the reading tools', () => {
    const talking = talkingToolsFor(SOCIAL);
    expect(toolPassesModeGate('check_posts', talking)).toBe(true);
    expect(toolPassesModeGate('web_search', talking)).toBe(true);
  });

  it('passes the always-allowed ones regardless', () => {
    const talking = talkingToolsFor(SOCIAL);
    expect(toolPassesModeGate('conversation_recall', talking)).toBe(true);
    expect(toolPassesModeGate('self_inspect', talking)).toBe(true);
  });
});

describe('the suffix names a variant of a real room', () => {
  it('is what a caller appends', () => {
    expect(`social${TALKING_MODE_SUFFIX}`).toBe('social:talking');
  });

  // Resolving the base room first and subtracting means a talking variant can
  // never drift from the room it belongs to: a tool added to `social` is
  // available for discussion the same day it is added for work.
  it('derives from the base room rather than restating it', () => {
    const extended = new Set([...SOCIAL, 'brand_new_read_tool']);
    expect(talkingToolsFor(extended).has('brand_new_read_tool')).toBe(true);
  });
});

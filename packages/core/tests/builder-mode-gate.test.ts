// Plan mode must not build.
//
// 2026-08-19, live: a Plan-mode turn read the codebase, presented a plan,
// wrote eleven todos, announced "Builder dispatched — executing 11 tasks" and
// began editing an Unreal project. The operator asked "why are you coding when
// did i say to do anything but plan".
//
// Plan mode is read-only and core enforces that properly — the planner is not
// handed `write` or `edit`. The restriction held right up until the
// AutoCoordinator spawned Builder agents, which were never bound by it.
//
// Underneath sat a second fault. The coordinator had its own mode detector
// that searched the SYSTEM prompt for 'Plan mode' — lowercase m — when the
// real marker is '[Plan Mode]' on the USER message. It matched nothing and
// answered 'work' for every mode on every turn, so a gate written against it
// would have looked correct and done nothing. These tests cover the detector
// first for that reason.

import { describe, it, expect } from 'vitest';
import { modeCanEditFiles, detectModeFromMessages } from '../src/agent/agent.js';
import type { Message } from '../src/core/types.js';

/** A turn as the surfaces actually send it: mode tag on the user message. */
const turn = (tagged: string): Message[] => [
  { role: 'system', content: 'You are Ava.' },
  { role: 'user', content: tagged },
];

describe('the mode of a turn is read from the tag the surfaces send', () => {
  it('reads every mode, not just the five the old copy listed', () => {
    // Write was absent from the coordinator's copy entirely.
    for (const [tag, mode] of [
      ['[Plan Mode]', 'plan'],
      ['[Chat Mode]', 'chat'],
      ['[Brainstorm Mode]', 'brainstorm'],
      ['[Write Mode]', 'write'],
      ['[Teach Mode]', 'teach'],
      ['[Security Audit Mode]', 'security'],
    ] as const) {
      expect(detectModeFromMessages(turn(`${tag} do the thing`)), tag).toBe(mode);
    }
  });

  it('does not look in the system prompt', () => {
    // The exact shape of the old bug: the words are in the system prompt, the
    // tag is not on the user message, so this is a work turn.
    const messages: Message[] = [
      { role: 'system', content: '[Plan Mode] You are Ava the Architect. Read-only.' },
      { role: 'user', content: 'finish the inventory system' },
    ];
    expect(detectModeFromMessages(messages)).toBeNull();
  });

  it('returns null for an untagged turn — work carries no tag', () => {
    expect(detectModeFromMessages(turn('finish the inventory system'))).toBeNull();
  });
});

describe('only a mode that can edit files may dispatch the Builder', () => {
  it('refuses the read-only modes', () => {
    // Derived from MODE_ALLOWED_TOOLS, so this cannot drift away from what the
    // mode is actually handed.
    for (const mode of ['plan', 'security', 'chat', 'brainstorm']) {
      expect(modeCanEditFiles(mode), `${mode} must not build`).toBe(false);
    }
  });

  it('allows the modes that change files', () => {
    for (const mode of ['work', 'write', 'teach']) {
      expect(modeCanEditFiles(mode), `${mode} should be able to build`).toBe(true);
    }
  });

  it('allows an untagged turn — that is work mode, which has no tag', () => {
    // If this returned false the gate would block ordinary coding, which is
    // a far worse failure than the one it was written to fix.
    expect(modeCanEditFiles(detectModeFromMessages(turn('add a health bar')))).toBe(true);
  });

  it('a Plan-mode turn is refused end to end', () => {
    // The live case, joined up: tag in, dispatch decision out.
    const messages = turn('[Plan Mode] finish the inventory system end-to-end');
    expect(modeCanEditFiles(detectModeFromMessages(messages))).toBe(false);
  });
});

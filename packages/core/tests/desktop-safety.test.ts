/**
 * 0G regression suite — the desktop safety gate.
 *
 * Every test here encodes a bug the operator actually caught live, or a trust
 * bar from the release plan. If one of these fails, a safety promise broke —
 * do NOT weaken the assertion to make it pass.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyAction,
  decideApproval,
  escalateRisk,
  IRREVERSIBLE_VERBS,
  type RiskClass,
} from '../src/desktop/safety.js';

describe('irreversible verb blocklist', () => {
  // Caught live 2026-07-02: "Empty Recycle Bin" auto-ran unattended because
  // "empty" was missing from the verb list.
  it('classifies "Empty Recycle Bin" as mutative-irreversible', () => {
    const c = classifyAction({ kind: 'click', targetName: 'Empty Recycle Bin' });
    expect(c.riskClass).toBe('mutative-irreversible');
  });

  it.each(['empty', 'erase', 'format', 'uninstall', 'delete', 'send', 'pay', 'purge'])(
    'contains the verb "%s"',
    (verb) => {
      expect(IRREVERSIBLE_VERBS.has(verb)).toBe(true);
    },
  );

  it('matches verbs on word boundaries, not substrings', () => {
    // "sending_id" must NOT trip "send"
    const c = classifyAction({ kind: 'click', targetName: 'sending_id column header' });
    expect(c.riskClass).toBe('mutative-reversible');
  });

  it('escalates a drag by its DROP target name (drag onto "Delete")', () => {
    const c = classifyAction({ kind: 'drag', targetName: 'report.pdf', dropTargetName: 'Delete' });
    expect(c.riskClass).toBe('mutative-irreversible');
  });
});

describe('escalateRisk — declared risk can never be laundered down', () => {
  // Caught live 2026-07-02: Planner declared irreversible; the computed class
  // was reversible; the gate auto-ran it. The computed classification may
  // only ESCALATE relative to the Planner's declaration.
  it('escalates computed reversible to declared irreversible', () => {
    expect(escalateRisk('mutative-reversible', 'mutative-irreversible')).toBe('mutative-irreversible');
  });

  it('never DE-escalates: computed irreversible + declared reversible stays irreversible', () => {
    expect(escalateRisk('mutative-irreversible', 'mutative-reversible')).toBe('mutative-irreversible');
  });

  it('ignores garbage declarations (never de-escalates on bad input)', () => {
    expect(escalateRisk('mutative-irreversible', 'totally-fine-trust-me')).toBe('mutative-irreversible');
    expect(escalateRisk('mutative-reversible', undefined)).toBe('mutative-reversible');
    expect(escalateRisk('mutative-reversible', null)).toBe('mutative-reversible');
  });

  it('escalates to privileged when declared', () => {
    expect(escalateRisk('mutative-reversible', 'privileged')).toBe('privileged');
  });
});

describe('decideApproval — the trust floor', () => {
  const LEVELS = ['watch', 'drive'] as const;

  // Release bar #1: no mutative-irreversible action ever fires unattended —
  // in EVERY mode, whitelist or not, and never from a cached approval.
  it.each(LEVELS)('irreversible ALWAYS requires approval in %s mode', (level) => {
    const d = decideApproval('mutative-irreversible', level, false);
    expect(d.requiresApproval).toBe(true);
    expect(d.forbidden).toBe(false);
    expect(d.cacheable).toBe(false); // never cached — fresh consent every time
  });

  it.each(LEVELS)('privileged is FORBIDDEN without opt-in in %s mode', (level) => {
    const d = decideApproval('privileged', level, false);
    expect(d.forbidden).toBe(true);
  });

  it.each(LEVELS)('privileged still requires single-use approval WITH opt-in in %s mode', (level) => {
    const d = decideApproval('privileged', level, true);
    expect(d.forbidden).toBe(false);
    expect(d.requiresApproval).toBe(true);
    expect(d.cacheable).toBe(false);
  });

  it('observational is always auto-allowed', () => {
    for (const level of LEVELS) {
      expect(decideApproval('observational', level, false).requiresApproval).toBe(false);
    }
  });

  it('drive auto-allows mutative-reversible; watch confirms it', () => {
    expect(decideApproval('mutative-reversible', 'drive', false).requiresApproval).toBe(false);
    expect(decideApproval('mutative-reversible', 'watch', false).requiresApproval).toBe(true);
  });
});

describe('classification signals stack (defence in depth)', () => {
  it('masked/sensitive field escalates beyond reversible', () => {
    const c = classifyAction({ kind: 'type', targetName: 'Password', isMaskedField: true });
    const order: RiskClass[] = ['observational', 'navigational', 'mutative-reversible', 'mutative-irreversible', 'privileged'];
    expect(order.indexOf(c.riskClass)).toBeGreaterThan(order.indexOf('mutative-reversible'));
  });

  it('reasons[] explains every escalation (audit requirement)', () => {
    const c = classifyAction({ kind: 'click', targetName: 'Empty Recycle Bin' });
    expect(c.reasons.length).toBeGreaterThan(0);
    expect(c.reasons.join(' ')).toMatch(/empty/i);
  });
});

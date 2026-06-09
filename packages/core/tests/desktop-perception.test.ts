// Phase C1 — perception merge layer. These tests pin the contract Scout
// relies on: tiers merge into one ranked ScreenState, DOM entries beat UIA
// duplicates, observation degrades cleanly when a tier is empty.

import { describe, it, expect } from 'vitest';
import { mergeTiers, browserSnapshotToTier, type PerceptionTier } from '../src/desktop/perception.js';
import type { BrowserSnapshot } from '../src/tools/desktop-providers.js';

const uiaTier = (names: string[]): PerceptionTier => ({
  source: 'uia',
  elements: names.map((name, i) => ({
    id: name || `el-${i}`,
    kind: 'button',
    name,
    source: 'uia' as const,
    interactable: true,
    sensitive: false,
  })),
  activeApp: 'Notepad',
});

const snapshot: BrowserSnapshot = {
  url: 'https://example.com/login',
  title: 'Sign in',
  elements: [
    { tag: 'button', selector: '#submit', text: 'Sign in' },
    { tag: 'input', selector: '#password', placeholder: 'Password' },
    { tag: 'link', selector: 'nav a:nth-of-type(1)', text: 'Help', href: '/help' },
  ],
};

describe('browserSnapshotToTier', () => {
  it('maps snapshot elements to playwright-sourced ScreenElements with selector as id', () => {
    const tier = browserSnapshotToTier(snapshot);
    expect(tier.source).toBe('playwright');
    expect(tier.activeUrl).toBe('https://example.com/login');
    expect(tier.activeTitle).toBe('Sign in');
    expect(tier.elements).toHaveLength(3);
    const submit = tier.elements[0];
    expect(submit.id).toBe('web-0');
    expect(submit.selector).toBe('#submit');
    expect(submit.name).toBe('Sign in');
    expect(submit.source).toBe('playwright');
  });

  it('flags sensitive fields from name/placeholder', () => {
    const tier = browserSnapshotToTier(snapshot);
    const pw = tier.elements.find(e => e.selector === '#password');
    expect(pw?.sensitive).toBe(true);
    expect(tier.elements[0].sensitive).toBe(false);
  });
});

describe('mergeTiers', () => {
  it('single tier keeps its grounding source', () => {
    const state = mergeTiers([uiaTier(['File', 'Edit', 'Close'])]);
    expect(state.groundingSource).toBe('uia');
    expect(state.elements).toHaveLength(3);
    expect(state.activeApp).toBe('Notepad');
  });

  it('two contributing tiers merge with source "merged" and keep provenance notes', () => {
    const state = mergeTiers([uiaTier(['File', 'Edit']), browserSnapshotToTier(snapshot)]);
    expect(state.groundingSource).toBe('merged');
    expect(state.elements).toHaveLength(5);
    expect(state.notes).toContain('uia: 2');
    expect(state.notes).toContain('playwright: 3');
    expect(state.activeApp).toBe('Notepad');
    expect(state.activeUrl).toBe('https://example.com/login');
  });

  it('drops the UIA duplicate when the same name exists in the DOM tier', () => {
    const state = mergeTiers([uiaTier(['Sign in', 'File']), browserSnapshotToTier(snapshot)]);
    const signIns = state.elements.filter(e => e.name.toLowerCase() === 'sign in');
    expect(signIns).toHaveLength(1);
    expect(signIns[0].source).toBe('playwright');
    expect(signIns[0].selector).toBe('#submit');
  });

  it('an empty tier contributes nothing and does not force "merged"', () => {
    const state = mergeTiers([uiaTier(['File', 'Edit']), { source: 'playwright', elements: [] }]);
    expect(state.groundingSource).toBe('uia');
    expect(state.elements).toHaveLength(2);
  });

  it('no elements at all → low confidence + the custom-rendered note', () => {
    const state = mergeTiers([{ source: 'uia', elements: [] }]);
    expect(state.confidence).toBe('low');
    expect(state.elements).toHaveLength(0);
    expect(state.notes).toMatch(/custom-rendered/);
  });

  it('confidence scales with merged density', () => {
    const many = uiaTier(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']);
    expect(mergeTiers([many]).confidence).toBe('high');
    expect(mergeTiers([uiaTier(['a'])]).confidence).toBe('medium');
  });
});

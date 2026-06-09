// ─── Desktop Perception Merge Layer ─────────────────────────────────────────
//
// Phase C1 of the desktop-automation plan: unify whatever perception tiers
// fired into ONE ranked ScreenState for the Planner. Until now Scout was
// UIA-only; this layer lets the accessibility tree, the Playwright DOM and
// (Phase C3) the Holo vision tier all contribute, with provenance preserved
// per element so the Actor can route actions back through the right channel
// (UIA coords vs DOM selector vs vision bbox).
//
// Design rules:
//   - Perception NEVER causes side effects. A tier that isn't already live
//     (e.g. no browser open) simply doesn't contribute — we never launch
//     anything to look at it.
//   - Dedupe prefers the more actionable source: a button visible in both
//     the UIA tree and the DOM keeps the DOM entry (a selector is exact;
//     screen coords on a web page are fragile under scroll).
//   - Confidence reflects the merged view, not any single tier.

import type {
  ScreenState, ScreenElement, ConfidenceLevel, GroundingSource,
} from './types.js';
import type { BrowserSnapshot } from '../tools/desktop-providers.js';

// Advisory sensitivity flag — the authoritative gate is classifyAction().
const SENSITIVE_NAME = /password|secret|token|api.?key|credential|card.?number|cvv|cvc|pin\b/i;

/** One perception source's contribution, pre-merge. */
export interface PerceptionTier {
  source: GroundingSource;
  elements: ScreenElement[];
  activeApp?: string;
  activeUrl?: string;
  activeTitle?: string;
  notes?: string;
}

/** Map a Playwright BrowserSnapshot into a perception tier. */
export function browserSnapshotToTier(snapshot: BrowserSnapshot): PerceptionTier {
  const elements: ScreenElement[] = (snapshot.elements || []).map((e, i) => {
    const name = (e.text || e.placeholder || e.value || e.href || '').trim();
    return {
      // Deliberately a PLAIN id (no CSS punctuation): the Planner has to echo
      // this inside JSON, and selectors like [data-ava-id="0"] force small
      // models into quote-escaping they reliably botch (observed: dropped
      // targets + unparseable output). The Actor maps id -> selector here.
      id: `web-${i}`,
      kind: e.tag,
      name,
      selector: e.selector,
      source: 'playwright' as const,
      interactable: true,
      sensitive: SENSITIVE_NAME.test(`${name} ${e.placeholder ?? ''}`),
    };
  });
  return {
    source: 'playwright',
    elements,
    activeUrl: snapshot.url || undefined,
    activeTitle: snapshot.title || undefined,
  };
}

/**
 * Merge perception tiers into one ranked ScreenState.
 *
 * Ranking: tiers keep their internal order; across tiers, the accessibility
 * tree leads (it sees the whole desktop) and page-level tiers follow. When
 * the same accessible name appears in both the UIA tree and a DOM tier, the
 * DOM entry wins and the UIA duplicate is dropped — same control, better
 * handle.
 */
export function mergeTiers(tiers: PerceptionTier[]): ScreenState {
  const contributing = tiers.filter(t => t.elements.length > 0);

  // Names owned by selector-bearing tiers (lowercased) — used to drop the
  // UIA duplicates of web-page controls.
  const domNames = new Set<string>();
  for (const t of contributing) {
    if (t.source === 'playwright') {
      for (const e of t.elements) {
        if (e.name) domNames.add(e.name.toLowerCase());
      }
    }
  }

  const elements: ScreenElement[] = [];
  for (const t of contributing) {
    for (const e of t.elements) {
      if (t.source === 'uia' && e.name && domNames.has(e.name.toLowerCase())) continue;
      elements.push(e);
    }
  }

  const sources = contributing.map(t => t.source);
  const groundingSource: GroundingSource =
    sources.length === 0 ? (tiers[0]?.source ?? 'uia')
    : sources.length === 1 ? sources[0]
    : 'merged';

  const confidence: ConfidenceLevel =
    elements.length > 8 ? 'high' : elements.length > 0 ? 'medium' : 'low';

  // Per-tier provenance + any tier notes, so the Planner knows what it's
  // looking through (and what it isn't — e.g. "no vision tier").
  const provenance = contributing.map(t => `${t.source}: ${t.elements.length}`).join(', ');
  const tierNotes = tiers.map(t => t.notes).filter(Boolean).join(' ');
  const notes = [
    provenance ? `Perception tiers — ${provenance}.` : undefined,
    elements.length === 0
      ? 'No elements from any perception tier — the window may be custom-rendered (vision tier arrives in Phase C3).'
      : undefined,
    tierNotes || undefined,
  ].filter(Boolean).join(' ') || undefined;

  // App/URL/title: the accessibility tier knows the active app; a DOM tier
  // knows the page. They complement rather than conflict.
  const uiaTier = contributing.find(t => t.source === 'uia') ?? tiers.find(t => t.source === 'uia');
  const pageTier = contributing.find(t => t.source === 'playwright');

  return {
    capturedAt: new Date().toISOString(),
    groundingSource,
    confidence,
    elements,
    activeApp: uiaTier?.activeApp,
    activeUrl: pageTier?.activeUrl,
    activeTitle: pageTier?.activeTitle ?? uiaTier?.activeTitle,
    notes,
  };
}

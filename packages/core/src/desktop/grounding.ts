// ─── C1: Grounding Layer ──────────────────────────────────────────────────
//
// Decision tree that picks the cheapest reliable grounding source for
// the current screen context, calls it, and returns a ScreenState.
//
// Hierarchy (from spec §4–5):
//   1. Browser window? → Playwright DOM (tier 2). Skip OmniParser.
//   2. UIA returned useful tree (≥5 interactable, named elements)?
//      → UIA (tier 1). Skip OmniParser.
//   3. UIA failed or junk → OmniParser (tier 3). Merge with sparse UIA.
//
// The grounding layer is a pure decision + adapter — it doesn't know
// about personas, trajectories, or budgets. Scout calls it.

import type { ScreenState, ScreenElement, GroundingSource, ConfidenceLevel } from './types.js';

// ── Backend interfaces ────────────────────────────────────────────────────
// Each grounding backend implements this. The actual calls go through
// Tauri invoke (UIA, screen capture) or the browser subprocess (Playwright)
// or an HTTP endpoint (OmniParser). These interfaces let the grounding
// layer stay transport-agnostic.

export interface GroundingBackend {
  name: GroundingSource;
  available(): Promise<boolean>;
  capture(): Promise<ScreenElement[]>;
}

export interface GroundingConfig {
  /** Minimum interactable elements for UIA to be considered "useful" */
  uiaMinElements: number;
  /** Maximum elements to request from OmniParser */
  omniMaxElements: number;
  /** Whether OmniParser is enabled (user may have declined the privacy prompt) */
  omniEnabled: boolean;
}

export const DEFAULT_GROUNDING_CONFIG: GroundingConfig = {
  uiaMinElements: 5,
  omniMaxElements: 50,
  omniEnabled: false,  // off until user opts in at first use
};

// ── Decision result ───────────────────────────────────────────────────────

export interface GroundingResult {
  screenState: ScreenState;
  /** Which source(s) were tried and their outcome */
  attempted: Array<{ source: GroundingSource; elementCount: number; usedMs: number }>;
  /** Total wall-clock for grounding this step */
  totalMs: number;
}

// ── Grounding layer ───────────────────────────────────────────────────────

export class GroundingLayer {
  private config: GroundingConfig;
  private backends: Map<GroundingSource, GroundingBackend> = new Map();

  constructor(config: Partial<GroundingConfig> = {}) {
    this.config = { ...DEFAULT_GROUNDING_CONFIG, ...config };
  }

  registerBackend(backend: GroundingBackend): void {
    this.backends.set(backend.name, backend);
  }

  async ground(context: {
    activeApp?: string;
    activeUrl?: string;
    activeTitle?: string;
    isBrowser?: boolean;
  }): Promise<GroundingResult> {
    const startMs = Date.now();
    const attempted: GroundingResult['attempted'] = [];
    let elements: ScreenElement[] = [];
    let source: GroundingSource = 'uia';
    let confidence: ConfidenceLevel = 'low';

    // ── Tier 2: Browser → Playwright ────────────────────────────────
    if (context.isBrowser) {
      const pw = this.backends.get('playwright');
      if (pw && await pw.available()) {
        const t0 = Date.now();
        const pwElements = await pw.capture();
        attempted.push({ source: 'playwright', elementCount: pwElements.length, usedMs: Date.now() - t0 });

        if (pwElements.length > 0) {
          elements = pwElements;
          source = 'playwright';
          confidence = pwElements.length >= 10 ? 'high' : 'medium';
          return this.buildResult(elements, source, confidence, context, attempted, startMs);
        }
      }
    }

    // ── Tier 1: UIA ─────────────────────────────────────────────────
    const uia = this.backends.get('uia');
    if (uia && await uia.available()) {
      const t0 = Date.now();
      const uiaElements = await uia.capture();
      attempted.push({ source: 'uia', elementCount: uiaElements.length, usedMs: Date.now() - t0 });

      const interactable = uiaElements.filter(e => e.interactable && e.name.trim().length > 0);
      if (interactable.length >= this.config.uiaMinElements) {
        elements = uiaElements;
        source = 'uia';
        confidence = interactable.length >= 15 ? 'high' : 'medium';
        return this.buildResult(elements, source, confidence, context, attempted, startMs);
      }
      // UIA returned junk — keep sparse elements for merge, fall through to OmniParser
      elements = uiaElements;
    }

    // ── Tier 3: OmniParser ──────────────────────────────────────────
    if (this.config.omniEnabled) {
      const omni = this.backends.get('omniparser');
      if (omni && await omni.available()) {
        const t0 = Date.now();
        const omniElements = await omni.capture();
        attempted.push({ source: 'omniparser', elementCount: omniElements.length, usedMs: Date.now() - t0 });

        if (omniElements.length > 0) {
          // Merge with any sparse UIA data — UIA provides control types,
          // OmniParser provides visual captions. Union by bbox overlap.
          if (elements.length > 0) {
            elements = mergeElements(elements, omniElements);
            source = 'merged';
          } else {
            elements = omniElements;
            source = 'omniparser';
          }
          confidence = 'medium';
          return this.buildResult(elements, source, confidence, context, attempted, startMs);
        }
      }
    }

    // ── Fallback: whatever we have ──────────────────────────────────
    return this.buildResult(elements, source, confidence, context, attempted, startMs);
  }

  private buildResult(
    elements: ScreenElement[],
    source: GroundingSource,
    confidence: ConfidenceLevel,
    context: { activeApp?: string; activeUrl?: string; activeTitle?: string },
    attempted: GroundingResult['attempted'],
    startMs: number,
  ): GroundingResult {
    const screenState: ScreenState = {
      capturedAt: new Date().toISOString(),
      groundingSource: source,
      confidence,
      elements,
      activeApp: context.activeApp,
      activeUrl: context.activeUrl,
      activeTitle: context.activeTitle,
      notes: confidence === 'low'
        ? `Grounding quality is low — ${elements.length} elements found. Planner should consider observe_more.`
        : undefined,
    };
    return { screenState, attempted, totalMs: Date.now() - startMs };
  }
}

// ── Element merge ─────────────────────────────────────────────────────────
// Combine UIA elements (typed, named) with OmniParser elements (captioned,
// bbox-accurate). Match by bbox overlap > 50%.

function mergeElements(uia: ScreenElement[], omni: ScreenElement[]): ScreenElement[] {
  const merged: ScreenElement[] = [...uia];
  for (const o of omni) {
    if (!o.bbox) { merged.push(o); continue; }
    const match = uia.find(u => u.bbox && bboxOverlap(u.bbox, o.bbox!) > 0.5);
    if (!match) {
      merged.push(o);
    }
    // If matched, UIA version is already in merged — OmniParser caption
    // could supplement but for v1 we keep UIA as source of truth
  }
  return merged;
}

function bboxOverlap(
  a: [number, number, number, number],
  b: [number, number, number, number],
): number {
  const [ax, ay, aw, ah] = a;
  const [bx, by, bw, bh] = b;
  const overlapX = Math.max(0, Math.min(ax + aw, bx + bw) - Math.max(ax, bx));
  const overlapY = Math.max(0, Math.min(ay + ah, by + bh) - Math.max(ay, by));
  const overlapArea = overlapX * overlapY;
  const aArea = aw * ah;
  return aArea > 0 ? overlapArea / aArea : 0;
}

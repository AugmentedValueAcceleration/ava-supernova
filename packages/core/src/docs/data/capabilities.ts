// Canonical capability × surface matrix — the single declared truth for
// "what works where". A doc page that `requires` a capability auto-hides on any
// surface that lacks it, and surface badges are derived from this table. So
// "the extension has no screenshot" is never written by hand — it's derived.
//
// Surfaces here are the *products* ('ext' | 'ide' | 'companion' | 'cli'). The
// public website ('web') is a superset: it shows every page regardless, with
// per-surface badges, so it is intentionally never listed as a gate below.

import type { Capability, Surface } from '../types.js';

/** Products that can actually run a capability (web excluded — it's the superset site). */
export type ProductSurface = Exclude<Surface, 'web'>;

export interface CapabilityFact {
  id: Capability;
  /** Plain-language label for badges and the capability reference. */
  label: string;
  /** One-line, newcomer-friendly description of what it lets you do. */
  summary: string;
  /** Product surfaces where this capability is available. */
  surfaces: ProductSurface[];
}

export const CAPABILITIES: CapabilityFact[] = [
  {
    id: 'desktop_automation',
    label: 'Desktop automation',
    summary: 'Ava can open apps, click buttons, and type for you across your whole computer.',
    surfaces: ['ide'],
  },
  {
    id: 'screenshot',
    label: 'Screen capture',
    summary: 'Ava can take and read screenshots of your screen.',
    surfaces: ['ide'],
  },
  {
    id: 'browser',
    label: 'Browser automation',
    summary: 'Ava can drive a real web browser — navigate pages, fill forms, gather information.',
    surfaces: ['ext', 'ide'],
  },
  {
    id: 'document_authoring',
    label: 'Document authoring',
    summary: 'Write mode — Ava drafts real documents and exports branded Word & PDF.',
    surfaces: ['ext', 'ide'],
  },
  {
    id: 'live_doc_preview',
    label: 'Live document preview',
    summary: 'Watch a document render live in the editor as Ava writes it.',
    surfaces: ['ext', 'ide'],
  },
];

const BY_ID: Record<Capability, CapabilityFact> = Object.fromEntries(
  CAPABILITIES.map(c => [c.id, c]),
) as Record<Capability, CapabilityFact>;

/** Does a product surface have a given capability? Web always returns true (superset). */
export function surfaceSupports(surface: Surface, capability: Capability): boolean {
  if (surface === 'web') return true;
  return BY_ID[capability]?.surfaces.includes(surface) ?? false;
}

/** The product surfaces where a capability is available (for badges). */
export function surfacesFor(capability: Capability): ProductSurface[] {
  return BY_ID[capability]?.surfaces ?? [];
}

const ALL_PRODUCTS: ProductSurface[] = ['ext', 'ide', 'companion', 'cli'];

/**
 * The product surfaces where *every* given capability is available — i.e. where
 * a page requiring all of them actually works. Used to derive "works here"
 * badges. An empty `caps` list means "everywhere" → all products.
 */
export function commonSurfaces(caps: Capability[]): ProductSurface[] {
  if (caps.length === 0) return [...ALL_PRODUCTS];
  return ALL_PRODUCTS.filter(s => caps.every(c => surfaceSupports(s, c)));
}

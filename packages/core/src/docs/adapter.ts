// Surface adapter contract. The website, extension, and IDE each implement this interface
// with their own primitives (Tailwind JSX for web, inline-styled JSX for IDE, HTML string
// builder for the extension webview). Keeping this contract in core guarantees all three
// surfaces render the same blocks in the same order from the same data.

import type {
  DocBlock,
  DocPage,
  SidebarNode,
  Surface,
  FactsBlock,
} from './types.js';
import type { ToolFact } from './data/tools.js';
import type { ProviderFact } from './data/providers.js';
import type { ModeFact } from './data/modes.js';
import type { PersonaFact } from './data/personas.js';
import type { PermissionModeFact } from './data/permissions.js';
import type { ShortcutFact } from './data/shortcuts.js';
import type { ProductSurface } from './data/capabilities.js';
import { commonSurfaces } from './data/capabilities.js';

/**
 * Optional per-page extras a renderer can surface alongside the body:
 *  - `deeper`: rendered "Show me the details" blocks shown behind an expander,
 *     so one page serves newcomers and power users.
 *  - `badges`: the product surfaces this page applies to (derived from its
 *     `requires`). Undefined means it works everywhere — no badge needed.
 */
export interface PageExtras<Out> {
  deeper?: Out[];
  badges?: ProductSurface[];
}

/** Which product surfaces to badge a page with — undefined when it works everywhere. */
export function pageBadges(page: DocPage): ProductSurface[] | undefined {
  if (!page.requires || page.requires.length === 0) return undefined;
  return commonSurfaces(page.requires);
}

/**
 * A surface renderer produces a value of type `Out` for each block. For React surfaces
 * Out is `ReactNode`; for the extension webview Out is `string` (HTML).
 */
export interface RendererAdapter<Out> {
  paragraph(text: string): Out;
  heading(level: 2 | 3 | 4, text: string, anchor?: string): Out;
  list(items: string[], ordered: boolean): Out;
  code(text: string, language: string): Out;
  callout(text: string, variant: 'note' | 'warning' | 'tip'): Out;
  link(text: string, href: string, external: boolean): Out;
  table(headers: string[], rows: string[][]): Out;

  // Fact-table blocks. Each surface renders these using its native primitives
  // (table, grid, card deck) while the data comes from a single source.
  tools(items: ToolFact[], filter: FactsBlock & { kind: 'tools' }): Out;
  providers(items: ProviderFact[], filter: FactsBlock & { kind: 'providers' }): Out;
  modes(items: ModeFact[]): Out;
  personas(items: PersonaFact[], filter: FactsBlock & { kind: 'personas' }): Out;
  permissions(items: PermissionModeFact[]): Out;
  shortcuts(items: ShortcutFact[], filter: FactsBlock & { kind: 'shortcuts' }): Out;

  /**
   * Assemble a list of rendered blocks into a page container. `extras` carries
   * the optional "Show me the details" depth and the surface badges; renderers
   * that don't yet support them can ignore the param (it's optional).
   */
  page(title: string, blocks: Out[], anchor: string, extras?: PageExtras<Out>): Out;
  /** Assemble a list of rendered pages into the top-level document. */
  document(pages: Out[], sidebar: SidebarNode[], surface: Surface): Out;
}

/**
 * Walk a single page's body blocks and drive the adapter. Pure function —
 * no surface primitives leak in here.
 */
export function renderPage<Out>(
  page: DocPage,
  adapter: RendererAdapter<Out>,
  data: FactsData,
): Out {
  const blocks = page.body.map(block => renderBlock(block, adapter, data));
  const deeper = page.deeper && page.deeper.length
    ? page.deeper.map(block => renderBlock(block, adapter, data))
    : undefined;
  return adapter.page(page.title, blocks, anchorFromId(page.id), { deeper, badges: pageBadges(page) });
}

export function renderBlock<Out>(
  block: DocBlock,
  adapter: RendererAdapter<Out>,
  data: FactsData,
): Out {
  switch (block.type) {
    case 'paragraph': return adapter.paragraph(block.text);
    case 'heading':   return adapter.heading(block.level, block.text, block.anchor);
    case 'list':      return adapter.list(block.items, block.ordered);
    case 'code':      return adapter.code(block.text, block.language);
    case 'callout':   return adapter.callout(block.text, block.variant);
    case 'link':      return adapter.link(block.text, block.href, block.external ?? false);
    case 'table':     return adapter.table(block.headers, block.rows);
    case 'facts':     return renderFacts(block, adapter, data);
  }
}

function renderFacts<Out>(
  block: FactsBlock,
  adapter: RendererAdapter<Out>,
  data: FactsData,
): Out {
  switch (block.kind) {
    case 'tools':
      return adapter.tools(filterTools(data.tools, block.filter), block);
    case 'providers':
      return adapter.providers(filterProviders(data.providers, block.filter), block);
    case 'modes':
      return adapter.modes(data.modes);
    case 'personas':
      return adapter.personas(filterPersonas(data.personas, block.filter), block);
    case 'permissions':
      return adapter.permissions(data.permissions);
    case 'shortcuts':
      return adapter.shortcuts(filterShortcuts(data.shortcuts, block.filter), block);
  }
}

export interface FactsData {
  tools: ToolFact[];
  providers: ProviderFact[];
  modes: ModeFact[];
  personas: PersonaFact[];
  permissions: PermissionModeFact[];
  shortcuts: ShortcutFact[];
}

function filterTools(items: ToolFact[], filter?: { category?: string; risk?: string }): ToolFact[] {
  if (!filter) return items;
  return items.filter(t =>
    (!filter.category || t.category === filter.category) &&
    (!filter.risk || t.risk === filter.risk),
  );
}

function filterProviders(items: ProviderFact[], filter?: { kind?: 'orchestration' | 'managed' | 'byok' }): ProviderFact[] {
  if (!filter?.kind) return items;
  return items.filter(p => p.kind === filter.kind);
}

function filterPersonas(items: PersonaFact[], filter?: { mode?: string }): PersonaFact[] {
  if (!filter?.mode) return items;
  return items.filter(p => p.mode === filter.mode);
}

function filterShortcuts(items: ShortcutFact[], filter?: { surface?: 'extension' | 'ide' | 'cli' }): ShortcutFact[] {
  if (!filter?.surface) return items;
  return items.filter(s => s.surfaces.includes(filter.surface!));
}

function anchorFromId(id: string): string {
  return id.replace(/\./g, '-');
}

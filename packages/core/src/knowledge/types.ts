/**
 * Knowledge Pack System — Types for domain expertise.
 *
 * Knowledge packs give Ava domain-specific context: marketing playbooks,
 * finance frameworks, legal terminology, etc. Same Ava, different expertise.
 */

import type { PersonaId } from '../personas/types.js';

/** A knowledge pack — domain expertise Ava can load contextually. */
export interface KnowledgePack {
  /** Unique identifier (e.g. "marketing", "finance", "legal"). */
  id: string;
  /** Display name (e.g. "Marketing & Growth"). */
  name: string;
  /** Short description of what this pack covers. */
  description: string;
  /** Domain category. */
  domain: KnowledgeDomain;
  /** The actual knowledge content (markdown). Injected into system prompt. */
  context: string;
  /** Which modes this pack activates in (empty = all modes). */
  modes?: string[];
  /** Which personas receive this knowledge (empty = all personas). */
  personas?: PersonaId[];
  /** Version of this pack. */
  version: string;
  /** Who created this pack. */
  author?: string;
  /** Whether this is a built-in pack or user-created. */
  builtIn: boolean;
}

/** Domain categories for knowledge packs. */
export type KnowledgeDomain =
  | 'marketing'
  | 'finance'
  | 'legal'
  | 'sales'
  | 'hr'
  | 'product'
  | 'design'
  | 'devops'
  | 'security'
  | 'data-science'
  | 'education'
  | 'game-development'
  | 'web-development'
  | 'mobile-development'
  | 'api-development'
  | 'systems-programming'
  | 'custom';

/** Lightweight pack metadata (for listing without loading full context). */
export interface KnowledgePackMeta {
  id: string;
  name: string;
  description: string;
  domain: KnowledgeDomain;
  version: string;
  author?: string;
  builtIn: boolean;
  enabled: boolean;
}

/** All valid domains. */
export const KNOWLEDGE_DOMAINS: KnowledgeDomain[] = [
  'marketing', 'finance', 'legal', 'sales', 'hr', 'product',
  'design', 'devops', 'security', 'data-science', 'education',
  'game-development', 'web-development', 'mobile-development',
  'api-development', 'systems-programming', 'custom',
];

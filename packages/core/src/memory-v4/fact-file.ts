/**
 * One fact, one Markdown file: a short frontmatter block, then the fact in
 * plain words. Written so the person can open it in any editor and read it,
 * and edit it by hand without breaking anything.
 *
 *   ---
 *   kind: preference
 *   scope: everywhere
 *   source: said
 *   quote: "im not a great fan of bold"
 *   from: 2026-11-06
 *   ---
 *   Doesn't like bold type; prefers thin or regular weights.
 */

import type { Fact, FactKind, FactScope, FactSource, FactState } from './types.js';
import { FACT_KINDS, FACT_SOURCES } from './types.js';

const FIELD_ORDER = ['kind', 'scope', 'source', 'quote', 'from', 'confirmed', 'replaces', 'until', 'superseded_by', 'tags'] as const;

/** Strings that YAML would misread are written as JSON strings (valid YAML). */
function formatValue(value: string | string[]): string {
  if (Array.isArray(value)) return JSON.stringify(value);
  return /^[\w./:@+-]+$/.test(value) ? value : JSON.stringify(value);
}

function parseValue(raw: string): string | string[] {
  const v = raw.trim();
  if (v.startsWith('"') || v.startsWith('[')) {
    try {
      return JSON.parse(v);
    } catch {
      // Hand-edited and no longer valid JSON: keep what's there rather than lose it.
    }
  }
  if (v.startsWith("'") && v.endsWith("'") && v.length >= 2) return v.slice(1, -1);
  return v;
}

export function serializeFact(fact: Fact): string {
  const fields: Record<string, string | string[] | undefined> = {
    kind: fact.kind,
    scope: fact.scope,
    source: fact.source,
    quote: fact.quote,
    from: fact.from,
    confirmed: fact.confirmed,
    replaces: fact.replaces,
    until: fact.until,
    superseded_by: fact.supersededBy,
    tags: fact.tags && fact.tags.length > 0 ? fact.tags : undefined,
  };
  const lines = ['---'];
  for (const key of FIELD_ORDER) {
    const value = fields[key];
    if (value === undefined || value === '') continue;
    lines.push(`${key}: ${formatValue(value)}`);
  }
  lines.push('---', fact.text.trim(), '');
  return lines.join('\n');
}

/**
 * Read a fact file. Lenient on purpose: a file the person has edited by hand
 * still loads, with sensible defaults for anything missing or unrecognised.
 * Returns null only when there is no fact text at all.
 */
export function parseFact(id: string, content: string, state: FactState): Fact | null {
  const text = content.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const fields: Record<string, string | string[]> = {};
  let body = text;
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (m) {
    for (const line of m[1].split('\n')) {
      const kv = line.match(/^([a-z_]+):\s*(.*)$/);
      if (kv) fields[kv[1]] = parseValue(kv[2]);
    }
    body = m[2];
  }
  const factText = body.trim();
  if (!factText) return null;

  const str = (k: string) => (typeof fields[k] === 'string' && fields[k] ? (fields[k] as string) : undefined);
  const kind = FACT_KINDS.includes(str('kind') as FactKind) ? (str('kind') as FactKind) : 'project';
  const source = FACT_SOURCES.includes(str('source') as FactSource) ? (str('source') as FactSource) : 'said';
  const scopeRaw = str('scope');
  const scope: FactScope = scopeRaw && (scopeRaw === 'everywhere' || scopeRaw.startsWith('project:'))
    ? (scopeRaw as FactScope)
    : 'everywhere';
  const tags = Array.isArray(fields.tags) ? fields.tags.map(String) : undefined;

  return {
    id,
    kind,
    scope,
    source,
    quote: str('quote'),
    from: str('from') ?? '',
    confirmed: str('confirmed'),
    replaces: str('replaces'),
    until: str('until'),
    supersededBy: str('superseded_by'),
    tags,
    text: factText,
    state,
  };
}

/**
 * A readable file name from the fact's words: "doesnt-like-bold-type".
 * Uniqueness is the store's job (it adds -2, -3 on a clash).
 */
export function slugFor(text: string): string {
  const words = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  let slug = '';
  for (const w of words) {
    if ((slug + '-' + w).length > 60) break;
    slug = slug ? `${slug}-${w}` : w;
    if (slug.split('-').length >= 8) break;
  }
  return slug || 'fact';
}

/** Lowercased, punctuation-free text, for spotting exact repeats. */
export function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

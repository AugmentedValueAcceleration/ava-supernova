// Product-knowledge retrieval — grounded, cited search over the docs corpus.
// Ava's self-knowledge layer: block-level TF-IDF over the SAME DocPages every
// surface renders, so answers can't drift from what users see.
//
// LIVES IN docs/ ON PURPOSE: docs/ is mirrored into the web + mobile apps by
// scripts/docs-sync.mjs. So this retriever ships to every standalone surface
// (web social composer, companion) — not just the core agent. Therefore it is
// SELF-CONTAINED: a small inline TF-IDF, no import from ../memory (which the
// mirror doesn't carry). The corpus is ~40 pages / a few-hundred blocks — well
// under the size where embeddings would earn their infrastructure — so plain
// TF-IDF (zero-dependency, local, free) is the right, on-brand tool.
//
// Freshness by construction: the index is built from getPages() at first use,
// so it always reflects the compiled-in docs — no separate store to rot.

import { getPages } from './corpus.js';
import { anchorFor } from './filter.js';
import type { DocPage, DocBlock, Section, Surface, Capability } from './types.js';

/** A retrieved documentation block with everything needed to cite it. */
export interface DocHit {
  /** Source page id, e.g. 'features.creative-studio'. */
  pageId: string;
  /** Human-readable page title — the citation target. */
  pageTitle: string;
  section: Section;
  /** URL fragment for a deep link, e.g. 'features-creative-studio'. */
  anchor: string;
  /** Surfaces the source page's feature applies to. */
  surfaces: Surface[];
  /** Capabilities gating the page, if any (drives availability notes). */
  requires?: Capability[];
  /** Shipping status of the source feature (omitted = shipped). */
  status?: 'shipped' | 'preview' | 'planned';
  /** The matched block's plain text. */
  text: string;
  /** TF-IDF cosine score (higher = more relevant). */
  score: number;
}

type BlockRecord = Omit<DocHit, 'score'>;

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been',
  'to', 'of', 'in', 'on', 'for', 'with', 'as', 'by', 'at', 'from', 'it', 'its',
  'this', 'that', 'these', 'those', 'you', 'your', 'i', 'we', 'they', 'he', 'she',
  'do', 'does', 'did', 'can', 'how', 'what', 'why', 'when', 'where', 'which', 'so',
]);

/** Lowercase, split on non-word chars but keep tool-name/path chars, drop stopwords. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9\-_./]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Plain, searchable text for a block. Code + live-facts blocks are skipped. */
function blockToSearchText(b: DocBlock): string | null {
  switch (b.type) {
    case 'paragraph': return b.text;
    case 'heading':   return b.text;
    case 'list':      return b.items.join('. ');
    case 'callout':   return b.text;
    case 'link':      return b.text;
    case 'table':     return [...b.headers, ...b.rows.flat()].join(' ');
    default:          return null; // code, facts
  }
}

/**
 * Block-granular TF-IDF index over a set of DocPages. Each translatable block
 * is one retrievable unit, keyed `pageId#index` (mirrors the i18n scheme), so
 * every hit carries a stable, citable id.
 */
export class ProductKnowledgeIndex {
  private readonly records = new Map<string, BlockRecord>();
  private readonly termVectors = new Map<string, Map<string, number>>();
  private readonly docFreq = new Map<string, number>();
  private readonly idf = new Map<string, number>();
  private docCount = 0;

  constructor(pages: DocPage[]) {
    for (const p of pages) {
      const meta = {
        pageId: p.id, pageTitle: p.title, section: p.section,
        anchor: anchorFor(p.id), surfaces: p.surfaces, requires: p.requires,
        status: p.status,
      };
      p.body.forEach((b, i) => {
        const t = blockToSearchText(b);
        if (t) this.add(`${p.id}#${i}`, { ...meta, text: t });
      });
      p.deeper?.forEach((b, i) => {
        const t = blockToSearchText(b);
        if (t) this.add(`${p.id}#deeper#${i}`, { ...meta, text: t });
      });
    }
    // IDF, computed once after all docs are added.
    for (const [term, df] of this.docFreq) {
      this.idf.set(term, Math.log(1 + this.docCount / (1 + df)));
    }
  }

  private add(key: string, rec: BlockRecord): void {
    this.records.set(key, rec);
    // Prepend the page title so each block reads as a self-contained chunk and
    // page-name queries surface its blocks.
    const terms = tokenize(`${rec.pageTitle}. ${rec.text}`);
    const tf = new Map<string, number>();
    for (const term of terms) tf.set(term, (tf.get(term) ?? 0) + 1);
    // Log-normalized TF.
    for (const [term, n] of tf) tf.set(term, 1 + Math.log(n));
    this.termVectors.set(key, tf);
    for (const term of new Set(terms)) this.docFreq.set(term, (this.docFreq.get(term) ?? 0) + 1);
    this.docCount++;
  }

  private tfidf(tf: Map<string, number>): Map<string, number> {
    const v = new Map<string, number>();
    for (const [term, w] of tf) v.set(term, w * (this.idf.get(term) ?? 0));
    return v;
  }

  private cosine(a: Map<string, number>, b: Map<string, number>): number {
    let dot = 0, na = 0, nb = 0;
    for (const [, w] of a) na += w * w;
    for (const [, w] of b) nb += w * w;
    if (na === 0 || nb === 0) return 0;
    const [small, large] = a.size < b.size ? [a, b] : [b, a];
    for (const [term, w] of small) { const o = large.get(term); if (o) dot += w * o; }
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }

  /** Ranked blocks for a query, best first. */
  search(query: string, limit = 6): DocHit[] {
    const qTerms = tokenize(query);
    if (qTerms.length === 0) return [];
    const qtf = new Map<string, number>();
    for (const t of qTerms) qtf.set(t, (qtf.get(t) ?? 0) + 1);
    const qVec = this.tfidf(qtf);
    const scored: DocHit[] = [];
    for (const [key, tf] of this.termVectors) {
      const score = this.cosine(qVec, this.tfidf(tf));
      if (score > 0) {
        const r = this.records.get(key)!;
        scored.push({ ...r, score });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }
}

let cached: ProductKnowledgeIndex | null = null;

/** Process-cached index over the canonical English corpus. Rebuilt on process
 *  start from the compiled-in docs, so it can never drift from the source. */
export function productKnowledgeIndex(): ProductKnowledgeIndex {
  if (!cached) cached = new ProductKnowledgeIndex(getPages('en'));
  return cached;
}

/** Grounded, cited search over Ava's own documentation. */
export function searchDocs(query: string, limit = 6): DocHit[] {
  return productKnowledgeIndex().search(query, limit);
}

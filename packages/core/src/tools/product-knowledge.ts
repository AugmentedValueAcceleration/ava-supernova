// Product-knowledge retrieval — grounded, cited search over the canonical docs
// corpus. This is Ava's self-knowledge layer: block-level TF-IDF over the SAME
// DocPages the web/extension/IDE render, so it can never drift from what users
// actually see.
//
// Deliberately NOT vector-RAG: the corpus is ~40 pages / a few hundred blocks —
// well under the size where embeddings earn their infrastructure. Plain TF-IDF
// (zero-dependency, local-first, free) is enough and stays on-brand. Local
// embeddings remain an optional future enhancement.
//
// Freshness by construction: the index is built from getPages() at process
// start, so it always reflects the compiled-in docs — no separate store to rot.
//
// Lives under tools/ (not docs/) on purpose: docs/ is mirrored into the web app
// by scripts/docs-sync.mjs, and this module imports the memory TF-IDF engine,
// which the web mirror does not carry.

import { getPages } from '../docs/corpus.js';
import { anchorFor } from '../docs/filter.js';
import type { DocPage, DocBlock, Section, Surface, Capability } from '../docs/types.js';
import { TfIdfIndex } from '../memory/tfidf.js';

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

/** Plain, searchable text for a block. Code + live-facts blocks are skipped —
 *  code is code; facts are rendered from live data, not prose. */
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
 * A block-granular TF-IDF index over a set of DocPages. Each translatable block
 * is one retrievable unit, keyed with the same `pageId#index` scheme the i18n
 * layer uses, so every hit carries a stable, citable id.
 */
export class ProductKnowledgeIndex {
  private readonly tfidf = new TfIdfIndex();
  private readonly records = new Map<string, BlockRecord>();

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
  }

  private add(key: string, rec: BlockRecord): void {
    this.records.set(key, rec);
    // Prepend the page title so each block reads as a self-contained chunk and
    // page-name queries surface its blocks. TF-IDF down-weights the repeated
    // title terms naturally, so this aids recall without skewing the ranking.
    this.tfidf.addDocument(key, `${rec.pageTitle}. ${rec.text}`);
  }

  /** Ranked blocks for a query, best first. */
  search(query: string, limit = 6): DocHit[] {
    return this.tfidf.search(query, limit)
      .map(({ id, score }) => {
        const r = this.records.get(id);
        return r ? { ...r, score } : null;
      })
      .filter((h): h is DocHit => h !== null);
  }
}

let cached: ProductKnowledgeIndex | null = null;

/** The process-cached index over the canonical English corpus. Built lazily on
 *  first use and reused; a process restart rebuilds it from the compiled-in
 *  docs, so it can never drift from the source of truth. */
export function productKnowledgeIndex(): ProductKnowledgeIndex {
  if (!cached) cached = new ProductKnowledgeIndex(getPages('en'));
  return cached;
}

/** Grounded, cited search over Ava's own documentation. */
export function searchDocs(query: string, limit = 6): DocHit[] {
  return productKnowledgeIndex().search(query, limit);
}

/**
 * TF-IDF (Term Frequency - Inverse Document Frequency) engine for memory retrieval.
 *
 * Provides much better search quality than substring matching, with zero external
 * dependencies. Pure math — works everywhere (Node.js, bundled extension, CLI).
 *
 * Architecture is open for future neural embedding augmentation.
 */

/** Stopwords to exclude from indexing (common English words that add noise). */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
  'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'both',
  'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
  'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
  'because', 'but', 'and', 'or', 'if', 'while', 'that', 'this', 'what',
  'which', 'who', 'whom', 'these', 'those', 'it', 'its', 'i', 'me',
  'my', 'we', 'our', 'you', 'your', 'he', 'him', 'his', 'she', 'her',
  'they', 'them', 'their', 'about', 'up', 'also', 'like', 'use', 'make',
]);

/** Tokenize text into normalized terms. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\-_./]/g, ' ')  // keep hyphens, underscores, dots, slashes (file paths, tool names)
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOPWORDS.has(w));
}

/** A sparse term-frequency vector. Keys are terms, values are TF weights. */
export type TermVector = Map<string, number>;

/** Build a TF vector from tokenized terms (log-normalized TF). */
export function buildTermVector(terms: string[]): TermVector {
  const freq = new Map<string, number>();
  for (const term of terms) {
    freq.set(term, (freq.get(term) ?? 0) + 1);
  }
  // Log-normalized TF: 1 + log(count)
  const vector: TermVector = new Map();
  for (const [term, count] of freq) {
    vector.set(term, 1 + Math.log(count));
  }
  return vector;
}

/** Cosine similarity between two sparse vectors. Returns 0–1. */
export function cosineSimilarity(a: TermVector, b: TermVector): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const [term, weightA] of a) {
    normA += weightA * weightA;
    const weightB = b.get(term);
    if (weightB !== undefined) {
      dot += weightA * weightB;
    }
  }
  for (const [, weightB] of b) {
    normB += weightB * weightB;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Cosine similarity between two DENSE vectors (e.g. neural embeddings).
 * Returns ~-1..1 (0 if empty, length-mismatched, or zero-magnitude).
 */
export function cosineDense(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * A lightweight TF-IDF index over a set of documents.
 *
 * Documents are identified by string IDs. The index is rebuilt in-memory
 * on load — no serialization needed since the memory store is small.
 */
export class TfIdfIndex {
  /** Document term vectors (TF component). */
  private docVectors = new Map<string, TermVector>();
  /** IDF weights per term across all documents. */
  private idfWeights = new Map<string, number>();
  /** Total document count. */
  private docCount = 0;
  /** Which documents contain each term (for IDF). */
  private documentFrequency = new Map<string, number>();

  /** Clear the entire index. */
  clear(): void {
    this.docVectors.clear();
    this.idfWeights.clear();
    this.documentFrequency.clear();
    this.docCount = 0;
  }

  /** Add or update a document in the index. */
  addDocument(id: string, text: string): void {
    // Remove old document if updating
    this.removeDocument(id);

    const terms = tokenize(text);
    const vector = buildTermVector(terms);
    this.docVectors.set(id, vector);
    this.docCount++;

    // Update document frequency
    const uniqueTerms = new Set(terms);
    for (const term of uniqueTerms) {
      this.documentFrequency.set(term, (this.documentFrequency.get(term) ?? 0) + 1);
    }

    // Recompute IDF (fast for typical memory sizes < 1000 entries)
    this.recomputeIdf();
  }

  /** Remove a document from the index. */
  removeDocument(id: string): void {
    const oldVector = this.docVectors.get(id);
    if (!oldVector) return;

    // Decrement document frequency for old terms
    for (const term of oldVector.keys()) {
      const df = this.documentFrequency.get(term);
      if (df !== undefined) {
        if (df <= 1) {
          this.documentFrequency.delete(term);
        } else {
          this.documentFrequency.set(term, df - 1);
        }
      }
    }

    this.docVectors.delete(id);
    this.docCount--;
    this.recomputeIdf();
  }

  /**
   * Search the index with a query string. Returns document IDs ranked by
   * TF-IDF cosine similarity, descending.
   */
  search(query: string, limit = 10): Array<{ id: string; score: number }> {
    const queryTerms = tokenize(query);
    if (queryTerms.length === 0) return [];

    const queryVector = this.applyIdf(buildTermVector(queryTerms));
    const results: Array<{ id: string; score: number }> = [];

    for (const [id, docTf] of this.docVectors) {
      const docTfIdf = this.applyIdf(docTf);
      const score = cosineSimilarity(queryVector, docTfIdf);
      if (score > 0) {
        results.push({ id, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /**
   * Find documents similar to a given document (by ID).
   * Useful for conflict/duplicate detection.
   */
  findSimilar(id: string, threshold = 0.3): Array<{ id: string; score: number }> {
    const docTf = this.docVectors.get(id);
    if (!docTf) return [];

    const docTfIdf = this.applyIdf(docTf);
    const results: Array<{ id: string; score: number }> = [];

    for (const [otherId, otherTf] of this.docVectors) {
      if (otherId === id) continue;
      const otherTfIdf = this.applyIdf(otherTf);
      const score = cosineSimilarity(docTfIdf, otherTfIdf);
      if (score >= threshold) {
        results.push({ id: otherId, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results;
  }

  /**
   * Compute similarity between a raw text and an existing document.
   * Used for conflict detection before the new doc is indexed.
   */
  similarityToText(existingId: string, newText: string): number {
    const existingTf = this.docVectors.get(existingId);
    if (!existingTf) return 0;

    const newTerms = tokenize(newText);
    if (newTerms.length === 0) return 0;

    const newVector = this.applyIdf(buildTermVector(newTerms));
    const existingTfIdf = this.applyIdf(existingTf);
    return cosineSimilarity(newVector, existingTfIdf);
  }

  /** Number of indexed documents. */
  get size(): number {
    return this.docCount;
  }

  // ── Private ──────────────────────────────────────────────────────────────

  /** Recompute IDF weights from current document frequencies. */
  private recomputeIdf(): void {
    this.idfWeights.clear();
    if (this.docCount === 0) return;

    for (const [term, df] of this.documentFrequency) {
      // Smooth IDF: log(1 + N/df) — avoids division by zero, reduces extreme weights
      this.idfWeights.set(term, Math.log(1 + this.docCount / df));
    }
  }

  /** Apply IDF weights to a TF vector, producing a TF-IDF vector. */
  private applyIdf(tf: TermVector): TermVector {
    const tfidf: TermVector = new Map();
    for (const [term, tfWeight] of tf) {
      const idf = this.idfWeights.get(term) ?? Math.log(1 + this.docCount);  // unseen term gets max IDF
      tfidf.set(term, tfWeight * idf);
    }
    return tfidf;
  }
}

/**
 * Keyword search for memory v4 (BM25), built for every language Ava speaks.
 *
 * Why not the old TF-IDF index: its tokenizer kept only a–z and 0–9, so every
 * fact in Arabic, Hindi, Russian, Chinese and the rest was invisible to search,
 * and it kept a sentence's full stop on the last word ("build.bat." never
 * matched "build.bat").
 *
 * Here:
 *   - words are any run of letters/numbers in any script, keeping inner
 *     . - _ / (file names, versions, paths) but not trailing punctuation;
 *   - scripts written without spaces (Chinese, Japanese, Korean, Thai, …)
 *     are indexed as overlapping pairs of characters, the standard approach
 *     when no word dictionary is available;
 *   - English plurals are folded ("facts" finds "fact");
 *   - common words are dropped so they can't carry a match on their own.
 */

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'shall', 'can',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'over',
  'and', 'or', 'but', 'if', 'so', 'than', 'too', 'very', 'just', 'not', 'no', 'nor',
  'that', 'this', 'these', 'those', 'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'how',
  'it', 'its', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'him', 'his', 'she', 'her',
  'they', 'them', 'their', 'about', 'up', 'also', 'any', 'all', 'some', 'there', 'here',
]);

/** Scripts written without spaces between words. */
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

function fold(word: string): string {
  // Light English plural folding only; anything smarter would need per-language stemmers.
  if (/^[a-z]+$/.test(word) && word.length > 3) {
    if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
    if (word.endsWith('sses')) return word.slice(0, -2);
    if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us') && !word.endsWith('is')) return word.slice(0, -1);
  }
  return word;
}

export function tokenizeAll(text: string): string[] {
  const out: string[] = [];
  const lower = text.normalize('NFKC').toLowerCase();
  // A "word": letters/numbers/marks, with inner . - _ / ' joining parts.
  for (const m of lower.matchAll(/[\p{L}\p{N}\p{M}]+(?:[.\-_/'’][\p{L}\p{N}\p{M}]+)*/gu)) {
    const raw = m[0].replace(/[’]/g, "'");
    if (UNSPACED.test(raw)) {
      const chars = [...raw];
      if (chars.length === 1) out.push(chars[0]);
      for (let i = 0; i + 1 < chars.length; i++) out.push(chars[i] + chars[i + 1]);
      continue;
    }
    const word = fold(raw.replace(/'s$/, '').replace(/'/g, ''));
    if (word.length > 1 && !STOPWORDS.has(word)) out.push(word);
    // "build.bat" is also findable as "build" and "bat"; "5.8" stays whole.
    if (/[.\-_/]/.test(word) && !/^[\d.]+$/.test(word)) {
      for (const part of word.split(/[.\-_/]+/)) {
        const p = fold(part);
        if (p.length > 1 && !STOPWORDS.has(p) && p !== word) out.push(p);
      }
    }
  }
  return out;
}

const K1 = 1.2;
const B = 0.75;

export class SearchIndex {
  private docs = new Map<string, Map<string, number>>();
  private lengths = new Map<string, number>();
  private df = new Map<string, number>();
  private totalLength = 0;

  get size(): number {
    return this.docs.size;
  }

  add(id: string, text: string): void {
    this.remove(id);
    const terms = tokenizeAll(text);
    const tf = new Map<string, number>();
    for (const t of terms) tf.set(t, (tf.get(t) ?? 0) + 1);
    this.docs.set(id, tf);
    this.lengths.set(id, terms.length);
    this.totalLength += terms.length;
    for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
  }

  remove(id: string): void {
    const tf = this.docs.get(id);
    if (!tf) return;
    for (const t of tf.keys()) {
      const n = (this.df.get(t) ?? 1) - 1;
      if (n <= 0) this.df.delete(t); else this.df.set(t, n);
    }
    this.totalLength -= this.lengths.get(id) ?? 0;
    this.docs.delete(id);
    this.lengths.delete(id);
  }

  private idf(term: string): number {
    const n = this.docs.size;
    const df = this.df.get(term) ?? 0;
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  }

  /**
   * Ranked matches, each with a score relative to a typical full match (about
   * 1; a short fact repeating the words can go higher), the share of the query's weight it covers, and
   * that weight itself (how rare the matched words are).
   */
  search(query: string, limit = 10): Array<{ id: string; score: number; coverage: number; weight: number }> {
    const terms = [...new Set(tokenizeAll(query))];
    if (terms.length === 0 || this.docs.size === 0) return [];
    const avg = this.totalLength / this.docs.size || 1;
    const weights = terms.map((t) => this.idf(t));
    const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
    // The score a document would get matching every term once at average length.
    const ideal = weights.reduce((s, w) => s + w * ((K1 + 1) / (1 + K1)), 0) || 1;

    const out: Array<{ id: string; score: number; coverage: number; weight: number }> = [];
    for (const [id, tf] of this.docs) {
      const len = this.lengths.get(id) ?? 0;
      let score = 0;
      let covered = 0;
      terms.forEach((t, i) => {
        const f = tf.get(t);
        if (!f) return;
        covered += weights[i];
        score += weights[i] * ((f * (K1 + 1)) / (f + K1 * (1 - B + B * (len / avg))));
      });
      if (score > 0) out.push({ id, score: score / ideal, coverage: covered / totalWeight, weight: covered });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}

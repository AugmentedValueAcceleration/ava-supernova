/**
 * AvaMemory — memory v4's one store.
 *
 *   <root>/core.md            always in front of Ava; hard budget
 *   <root>/facts/<id>.md      one fact per file
 *   <root>/pending/<id>.md    inferred facts waiting for the person's yes
 *   <root>/history/<id>.md    facts that were replaced ("true until …")
 *   <root>/episodes/<date>.md what happened each day
 *   <root>/threads.md         open promises and loose ends
 *   <root>/projects.json      stable project ids and links
 *   <root>/.index/            derived search data; safe to delete
 *
 * Rules this class enforces, because each one was broken by the old system:
 *   - One copy. What the Memory page shows is what Ava searches.
 *   - Delete means gone: file, search entry and embedding together.
 *   - A guess is never a fact: source `inferred` lands in pending/.
 *   - Corrections replace: the old fact moves to history, marked until when.
 *   - Every change happens under one lock, safe with several apps open.
 */

import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { EmbeddingService } from '../memory/embedding-service.js';
import { EmbeddingStore } from '../memory/embedding-store.js';
import { cosineDense } from '../memory/tfidf.js';
import { SearchIndex } from './search-index.js';
import type { Fact, FactScope, FactState, NewFact, ProjectRecord, Thread } from './types.js';
import { CORE_TOKEN_BUDGET } from './types.js';
import { normalizeForMatch, serializeFact, slugFor } from './fact-file.js';
import { readIfExists, removeIfExists, today, withLock, writeAtomic } from './files.js';
import { ProjectRegistry } from './projects.js';
import { FactFolderCache } from './fact-cache.js';
import {
  addToEpisode,
  newThreadId,
  parseEpisode,
  parseThreads,
  serializeEpisode,
  serializeThreads,
  type Episode,
} from './threads-episodes.js';

const STATE_DIR: Record<FactState, string> = { fact: 'facts', pending: 'pending', history: 'history' };

/** Hits from linked projects rank a little below the open one's; other projects lower still. */
const LINKED_WEIGHT = 0.85;
const OTHER_WEIGHT = 0.7;
/** A keyword hit must cover this share of the query's weight (rare words weigh more). */
const COVERAGE_MIN = 0.3;
/**
 * …and the matched words must be rare enough to mean something. A word in
 * most facts ("project" in a project's memory) scores below this, so it can't
 * make a match on its own however short the query.
 */
const WEIGHT_MIN = 0.5;
/** For long messages: the matched words must weigh as much as two words found in only one fact. */
const RARE_MIN = 1.5;
const SEMANTIC_MIN = 0.5;

/** A rough token count: enough to hold core to its budget in any language. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface SearchOptions {
  /** The open project's id. Without it, only `everywhere` facts are "here". */
  project?: string;
  /**
   * `here` (default): everywhere + the open project.
   * `linked`: also the projects declared connected to it.
   * `all`: every project; each hit says which project it is from.
   */
  reach?: 'here' | 'linked' | 'all';
  /** Also search these projects by id (asking about another project by name). */
  alsoProjects?: string[];
  limit?: number;
}

export interface SearchHit {
  fact: Fact;
  score: number;
  match: 'words' | 'meaning';
  /** Where the hit is from, relative to the open project. */
  from: 'everywhere' | 'here' | 'linked' | 'other';
}

export class AvaMemory {
  readonly root: string;
  readonly projects: ProjectRegistry;
  private readonly embeddingService: EmbeddingService | null;
  private embeddings: EmbeddingStore | null = null;
  private embeddingsReady: Promise<void> | null = null;

  // Parsed fact files per folder; re-read only what changed (any app).
  private readonly cache: Record<FactState, FactFolderCache>;
  // Search index, rebuilt when the facts folder's cache version moves.
  private indexVersion = -1;
  private index = new SearchIndex();
  private indexFacts = new Map<string, Fact>();

  constructor(opts: { root: string; embeddingService?: EmbeddingService | null }) {
    this.root = opts.root;
    this.projects = new ProjectRegistry(opts.root);
    this.embeddingService = opts.embeddingService ?? null;
    this.cache = {
      fact: new FactFolderCache(join(opts.root, STATE_DIR.fact), 'fact'),
      pending: new FactFolderCache(join(opts.root, STATE_DIR.pending), 'pending'),
      history: new FactFolderCache(join(opts.root, STATE_DIR.history), 'history'),
    };
  }

  private dir(state: FactState): string {
    return join(this.root, STATE_DIR[state]);
  }

  private factPath(state: FactState, id: string): string {
    return join(this.dir(state), `${id}.md`);
  }

  /** Write a fact file and tell the cache. Call while holding the lock. */
  private async put(fact: Fact): Promise<void> {
    await writeAtomic(this.factPath(fact.state, fact.id), serializeFact(fact));
    await this.cache[fact.state].noteWrite(fact);
  }

  /** Remove a fact file and tell the cache. Call while holding the lock. */
  private async drop(state: FactState, id: string): Promise<boolean> {
    const removed = await removeIfExists(this.factPath(state, id));
    if (removed) await this.cache[state].noteRemove(id);
    return removed;
  }

  /** Bring every folder's cache up to date (sees other apps' writes). Call under the lock before writing. */
  private async refreshAll(): Promise<void> {
    await Promise.all([this.readState('fact'), this.readState('pending'), this.readState('history')]);
  }

  /** A fact by id from the (fresh) caches. */
  private async find(id: string, states: readonly FactState[] = ['fact', 'pending', 'history']): Promise<Fact | null> {
    for (const state of states) {
      const f = (await this.readState(state)).find((x) => x.id === id);
      if (f) return f;
    }
    return null;
  }

  // ── Core ────────────────────────────────────────────────────────────────

  async readCore(): Promise<string> {
    return (await readIfExists(join(this.root, 'core.md'))) ?? '';
  }

  /**
   * Replace core. Refused (nothing written) when over budget: core rides in
   * front of every message, and a core nobody can afford to send is no core.
   */
  async writeCore(text: string): Promise<{ ok: true; tokens: number } | { ok: false; tokens: number; budget: number }> {
    const tokens = estimateTokens(text);
    if (tokens > CORE_TOKEN_BUDGET) return { ok: false, tokens, budget: CORE_TOKEN_BUDGET };
    await withLock(this.root, () => writeAtomic(join(this.root, 'core.md'), text.trimEnd() + '\n'));
    return { ok: true, tokens };
  }

  // ── Facts: read ─────────────────────────────────────────────────────────

  private readState(state: FactState): Promise<Fact[]> {
    return this.cache[state].facts();
  }

  /** Facts in one state (default: current facts). */
  async listFacts(state: FactState | 'all' = 'fact'): Promise<Fact[]> {
    if (state !== 'all') return this.readState(state);
    const [f, p, h] = await Promise.all([this.readState('fact'), this.readState('pending'), this.readState('history')]);
    return [...f, ...p, ...h];
  }

  async getFact(id: string): Promise<Fact | null> {
    return this.find(id);
  }

  /** The chain of versions of a fact, newest first (current, then what it replaced, …). */
  async factHistory(id: string): Promise<Fact[]> {
    const chain: Fact[] = [];
    const seen = new Set<string>();
    let next: string | undefined = id;
    while (next && !seen.has(next)) {
      seen.add(next);
      const f = await this.getFact(next);
      if (!f) break;
      chain.push(f);
      next = f.replaces;
    }
    return chain;
  }

  // ── Facts: write ────────────────────────────────────────────────────────

  private async exists(id: string): Promise<boolean> {
    return (await this.find(id)) !== null;
  }

  private async uniqueId(text: string): Promise<string> {
    const base = slugFor(text);
    let id = base;
    for (let n = 2; await this.exists(id); n++) id = `${base}-${n}`;
    return id;
  }

  private async findSame(text: string, scope: FactScope): Promise<Fact | null> {
    const want = normalizeForMatch(text);
    for (const state of ['fact', 'pending'] as const) {
      for (const f of await this.readState(state)) {
        if (f.scope === scope && normalizeForMatch(f.text) === want) return f;
      }
    }
    return null;
  }

  /**
   * Save a new fact. Something the person said, or that a file or tool shows,
   * is a fact at once; something inferred waits in pending/ for their yes.
   * Saving the same words again returns the existing fact instead of a copy.
   */
  async addFact(input: NewFact): Promise<{ fact: Fact; created: boolean }> {
    const text = input.text.trim();
    if (!text) throw new Error('A memory needs some words.');
    const scope = input.scope ?? 'everywhere';
    const result = await withLock(this.root, async () => {
      await this.refreshAll();
      const same = await this.findSame(text, scope);
      if (same) return { fact: same, created: false };
      const source = input.source ?? 'said';
      const fact: Fact = {
        id: await this.uniqueId(text),
        kind: input.kind ?? (scope === 'everywhere' ? 'preference' : 'project'),
        scope,
        source,
        quote: input.quote?.trim() || undefined,
        from: input.from ?? today(),
        confirmed: input.confirmed,
        replaces: input.replaces,
        tags: input.tags,
        text,
        state: source === 'inferred' && !input.confirmed ? 'pending' : 'fact',
      };
      await this.put(fact);
      return { fact, created: true };
    });
    if (result.created && result.fact.state === 'fact') void this.embedInBackground(result.fact);
    return result;
  }

  /** The person said yes to an inferred fact: it becomes a fact. */
  async confirmFact(id: string): Promise<Fact | null> {
    const fact = await withLock(this.root, async () => {
      await this.refreshAll();
      const f = await this.find(id, ['pending']);
      if (!f) return null;
      const confirmed: Fact = { ...f, state: 'fact', confirmed: today() };
      await this.put(confirmed);
      await this.drop('pending', id);
      // A noticed CHANGE retires the fact it replaces only now, on their yes:
      // until then the old fact stayed current.
      if (f.replaces) {
        const old = await this.find(f.replaces, ['fact']);
        if (old) {
          await this.put({ ...old, state: 'history', until: confirmed.confirmed, supersededBy: confirmed.id });
          await this.drop('fact', old.id);
        }
      }
      return confirmed;
    });
    if (fact) void this.embedInBackground(fact);
    return fact;
  }

  /**
   * Something changed ("rent went up", "walk moved off Shift"). The new fact
   * replaces the old one, which moves to history marked "true until today"
   * and pointing at its replacement. History is never shown as current.
   */
  async replaceFact(id: string, input: NewFact): Promise<{ fact: Fact; previous: Fact } | null> {
    const text = input.text.trim();
    if (!text) throw new Error('A memory needs some words.');
    const result = await withLock(this.root, async () => {
      await this.refreshAll();
      const previous = await this.find(id, ['fact', 'pending']);
      if (!previous) return null;
      const source = input.source ?? 'said';
      const fact: Fact = {
        id: await this.uniqueId(text),
        kind: input.kind ?? previous.kind,
        scope: input.scope ?? previous.scope,
        source,
        quote: input.quote?.trim() || undefined,
        from: input.from ?? today(),
        replaces: previous.id,
        confirmed: input.confirmed,
        tags: input.tags ?? previous.tags,
        text,
        state: source === 'inferred' && !input.confirmed ? 'pending' : 'fact',
      };
      const retired: Fact = { ...previous, state: 'history', until: fact.from, supersededBy: fact.id };
      await this.put(fact);
      await this.put(retired);
      await this.drop(previous.state, previous.id);
      return { fact, previous: retired };
    });
    if (result) {
      await this.forgetEmbedding(id);
      if (result.fact.state === 'fact') void this.embedInBackground(result.fact);
    }
    return result;
  }

  /**
   * Fix a fact in place — a typo, a better wording, the wrong project. Not a
   * change in the world (that's replaceFact), so no history entry is made.
   */
  async editFact(id: string, patch: Partial<Pick<Fact, 'text' | 'kind' | 'scope' | 'tags'>>): Promise<Fact | null> {
    const fact = await withLock(this.root, async () => {
      await this.refreshAll();
      const f = await this.find(id);
      if (!f) return null;
      const next: Fact = { ...f, ...patch, text: (patch.text ?? f.text).trim() };
      await this.put(next);
      return next;
    });
    if (fact && patch.text !== undefined) {
      await this.forgetEmbedding(id);
      if (fact.state === 'fact') void this.embedInBackground(fact);
    }
    return fact;
  }

  /** Gone: the file in whichever folder it's in, its search entry and its embedding. */
  async deleteFact(id: string): Promise<boolean> {
    const removed = await withLock(this.root, async () => {
      let any = false;
      await this.refreshAll();
      for (const state of ['fact', 'pending', 'history'] as const) {
        if (await this.drop(state, id)) any = true;
      }
      return any;
    });
    if (removed) {
      this.index.remove(id);
      this.indexFacts.delete(id);
      await this.forgetEmbedding(id);
    }
    return removed;
  }

  // ── Threads ─────────────────────────────────────────────────────────────

  private threadsPath(): string {
    return join(this.root, 'threads.md');
  }

  async listThreads(opts: { includeDone?: boolean; project?: string } = {}): Promise<Thread[]> {
    const all = parseThreads(await readIfExists(this.threadsPath()));
    return all.filter((t) => (opts.includeDone || !t.done) && (!opts.project || !t.project || t.project === opts.project));
  }

  async addThread(input: { text: string; project?: string; due?: string }): Promise<Thread> {
    const text = input.text.trim();
    if (!text) throw new Error('A thread needs some words.');
    return withLock(this.root, async () => {
      const all = parseThreads(await readIfExists(this.threadsPath()));
      const same = all.find((t) => !t.done && normalizeForMatch(t.text) === normalizeForMatch(text) && t.project === input.project);
      if (same) return same;
      const thread: Thread = { id: newThreadId(), text, project: input.project, added: today(), due: input.due };
      all.push(thread);
      await writeAtomic(this.threadsPath(), serializeThreads(all));
      return thread;
    });
  }

  async closeThread(id: string): Promise<boolean> {
    return this.updateThreads((all) => {
      const t = all.find((x) => x.id === id && !x.done);
      if (!t) return false;
      t.done = today();
      return true;
    });
  }

  async deleteThread(id: string): Promise<boolean> {
    return this.updateThreads((all) => {
      const i = all.findIndex((x) => x.id === id);
      if (i === -1) return false;
      all.splice(i, 1);
      return true;
    });
  }

  private async updateThreads(change: (all: Thread[]) => boolean): Promise<boolean> {
    return withLock(this.root, async () => {
      const all = parseThreads(await readIfExists(this.threadsPath()));
      if (!change(all)) return false;
      await writeAtomic(this.threadsPath(), serializeThreads(all));
      return true;
    });
  }

  // ── Episodes ────────────────────────────────────────────────────────────

  private episodePath(date: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Not a date: ${date}`);
    return join(this.root, 'episodes', `${date}.md`);
  }

  async readDay(date: string): Promise<Episode> {
    return parseEpisode(date, await readIfExists(this.episodePath(date)));
  }

  /** Add lines to a day, under a project (or not tied to one). Repeats are skipped. */
  async addToDay(date: string, section: { project?: string; name: string }, lines: string[]): Promise<Episode> {
    return withLock(this.root, async () => {
      const ep = addToEpisode(parseEpisode(date, await readIfExists(this.episodePath(date))), section, lines);
      await writeAtomic(this.episodePath(date), serializeEpisode(ep));
      return ep;
    });
  }

  /** Every day with an episode, oldest first. */
  async listDays(): Promise<string[]> {
    try {
      return (await readdir(join(this.root, 'episodes')))
        .filter((n) => /^\d{4}-\d{2}-\d{2}\.md$/.test(n))
        .map((n) => n.slice(0, 10))
        .sort();
    } catch {
      return [];
    }
  }

  // ── Projects ────────────────────────────────────────────────────────────

  /** The open project's record, registering it the first time it is seen. */
  async projectFor(path: string, name?: string): Promise<ProjectRecord> {
    const known = await this.projects.find(path);
    if (known) return known;
    return withLock(this.root, () => this.projects.ensure(path, name));
  }

  /** A project known only by name (see ProjectRegistry.ensureByName). */
  async projectNamed(name: string): Promise<ProjectRecord> {
    return withLock(this.root, () => this.projects.ensureByName(name));
  }

  async linkProjects(a: string, b: string): Promise<boolean> {
    return withLock(this.root, () => this.projects.link(a, b));
  }

  async unlinkProjects(a: string, b: string): Promise<void> {
    await withLock(this.root, () => this.projects.unlink(a, b));
  }

  // ── Search ──────────────────────────────────────────────────────────────

  private async refreshIndex(): Promise<void> {
    const facts = await this.readState('fact');
    if (this.cache.fact.version === this.indexVersion) return;
    this.index = new SearchIndex();
    this.indexFacts = new Map();
    for (const f of facts) {
      this.index.add(f.id, [f.text, f.quote ?? '', ...(f.tags ?? [])].join(' '));
      this.indexFacts.set(f.id, f);
    }
    this.indexVersion = this.cache.fact.version;
  }

  /** Where a fact sits relative to the open project; null = outside this search. */
  private placement(fact: Fact, opts: SearchOptions, linked: Set<string>): SearchHit['from'] | null {
    if (fact.scope === 'everywhere') return 'everywhere';
    const pid = fact.scope.slice('project:'.length);
    if (opts.project && pid === opts.project) return 'here';
    if (opts.alsoProjects?.includes(pid)) return 'other';
    if (linked.has(pid) && (opts.reach === 'linked' || opts.reach === 'all')) return 'linked';
    if (opts.reach === 'all') return 'other';
    return null;
  }

  /**
   * Search current facts (never pending, never history). Keyword search always;
   * meaning search too when local embeddings are on. A project's facts are only
   * searched when that project is open, linked, or asked for — so one project's
   * facts don't leak into another.
   */
  async search(query: string, opts: SearchOptions = {}): Promise<SearchHit[]> {
    const q = query.trim();
    if (!q) return [];
    await this.refreshIndex();
    const limit = opts.limit ?? 8;
    const linked = new Set(opts.project ? ((await this.projects.get(opts.project))?.links ?? []) : []);
    const weight = (from: SearchHit['from']) => (from === 'linked' ? LINKED_WEIGHT : from === 'other' ? OTHER_WEIGHT : 1);

    const best = new Map<string, SearchHit>();
    const consider = (id: string, raw: number, match: SearchHit['match']) => {
      const fact = this.indexFacts.get(id);
      if (!fact) return;
      const from = this.placement(fact, opts, linked);
      if (!from) return;
      const score = raw * weight(from);
      const prev = best.get(id);
      if (!prev || score > prev.score) best.set(id, { fact, score, match, from });
    };

    for (const { id, score, coverage, weight, rare } of this.index.search(q, limit * 4)) {
      // With only a few facts every word looks common, so the floor waits until there are some.
      const rareEnough = this.index.size < 5 || weight >= WEIGHT_MIN;
      // Enough of the query, OR (for a long message) at least two rare words' worth of it.
      if (rareEnough && (coverage >= COVERAGE_MIN || rare >= RARE_MIN)) consider(id, score, 'words');
    }

    const store = await this.embeddingStore();
    if (store && this.embeddingService && !this.embeddingService.tripped) {
      const qv = await this.embeddingService.embed(q);
      if (qv) {
        for (const id of this.indexFacts.keys()) {
          const v = store.get(id);
          if (!v) continue;
          const sim = cosineDense(qv, v);
          if (sim >= SEMANTIC_MIN) consider(id, sim, 'meaning');
        }
      }
    }

    return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  }

  // ── Embeddings (optional, local) ────────────────────────────────────────

  private async embeddingStore(): Promise<EmbeddingStore | null> {
    if (!this.embeddingService) return null;
    if (!this.embeddingsReady) {
      this.embeddings = new EmbeddingStore(join(this.root, '.index'), this.embeddingService.embedModel);
      this.embeddingsReady = (async () => {
        await mkdir(join(this.root, '.index'), { recursive: true });
        await this.embeddings!.load();
      })();
    }
    await this.embeddingsReady;
    return this.embeddings;
  }

  private async embedInBackground(fact: Fact): Promise<void> {
    try {
      const store = await this.embeddingStore();
      if (!store || !this.embeddingService) return;
      const vec = await this.embeddingService.embed(fact.text);
      if (vec) store.set(fact.id, vec);
    } catch {
      // Embeddings are an extra; a failed one just means keyword search for this fact.
    }
  }

  private async forgetEmbedding(id: string): Promise<void> {
    const store = await this.embeddingStore();
    if (!store) return;
    store.delete(id);
    await store.flush();
  }

  /** Embed every current fact that has no vector yet. Resumable; stops if the endpoint is down. */
  async backfillEmbeddings(): Promise<number> {
    const store = await this.embeddingStore();
    if (!store || !this.embeddingService) return 0;
    let done = 0;
    for (const f of await this.readState('fact')) {
      if (store.has(f.id)) continue;
      if (this.embeddingService.tripped) break;
      const vec = await this.embeddingService.embed(f.text);
      if (vec) { store.set(f.id, vec); done++; }
    }
    await store.flush();
    return done;
  }
}

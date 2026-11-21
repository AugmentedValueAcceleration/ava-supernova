// Usage ledger — every model reply, one line each, in ~/.ava/usage/<YYYY-MM>.jsonl.
//
// His call, 21 Nov 2026 (plan 2026-11-21-usage-timeline): the Usage tab gets a
// timeline — look up what you spent over any period, money AND tokens.
//
// Why a ledger and not counters. The old Usage tab kept one running total per
// month (extension in VS Code's storage, IDE in browser storage). That lost
// three things a timeline needs:
//   - the DAY: a closed month was one number, so no day or week could be shown;
//   - the PRICE AT THE TIME: cost was recalculated on every page open at
//     today's rates, so last month moved whenever a rate changed;
//   - the OTHER APP: each kept its own, so neither showed your real total.
// One line per reply, written where every reply already reports its tokens
// (Agent.run), fixes all three, and every view is summed from the same lines,
// so no two views can disagree.
//
// Recording is OFF until a program switches it on with configureUsageLedger.
// The extension host, the IDE sidecar, the CLI and the Unreal panel do; the
// website's server imports core too, and must never write a ~/.ava on Render.
//
// Plain files, append-only, one per month — the same pattern as memory and the
// audit log. A line is ~200 bytes; a heavy month is a few MB.

import { appendFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { AVA_HOME } from '../core/constants.js';
import { usdRateFor } from '../audit/cost.js';

/** Which program spent it. 'unreal' is the Assistant panel inside Unreal. */
export type UsageSurface = 'ext' | 'ide' | 'cli' | 'unreal';

/** One model reply. Short keys: this is written thousands of times a month. */
export interface UsageEntry {
  /** When, ISO 8601 with the user's own offset — a day is THEIR day, not UTC's. */
  t: string;
  surface: UsageSurface;
  /** main, health, learning, design, social, brainstorm — or 'background' for
   *  a call made outside any turn (memory upkeep and the like). */
  room: string;
  /** The mode or room id the turn ran in: work, plan, chat, health, gym…
   *  ('background' as above). */
  mode: string;
  provider: string;
  model: string;
  /** Input (prompt) tokens. */
  in: number;
  /** Output (completion) tokens. */
  out: number;
  /** Prompt tokens served from the provider's cache — only when it said so.
   *  Absent means the provider reported nothing, not zero. */
  cached?: number;
  /** Estimated USD at the moment of spend. Absent when no rate was known. */
  usd?: number;
}

let surface: UsageSurface | null = null;
let dirOverride: string | null = null;

/**
 * Switch recording on for this process. Call once at start-up, in the program
 * that owns the user's machine. `dir` is for tests only.
 */
export function configureUsageLedger(opts: { surface: UsageSurface; dir?: string } | null): void {
  surface = opts?.surface ?? null;
  dirOverride = opts?.dir ?? null;
}

export function usageLedgerEnabled(): boolean {
  return surface !== null;
}

// ─── Where the spend belongs ────────────────────────────────────────────────
// The ledger records at the provider (base-provider.ts), where every paid call
// passes — but the provider cannot know which room the user is in. Agent.run()
// says so here, and every call made inside the turn (compression, the curator,
// auto mode's builder) inherits it.

interface UsageScope { room: string; mode: string }
const scopeStorage = new AsyncLocalStorage<UsageScope>();

/**
 * Run `fn` with its spend filed under this room and mode. An outer scope wins:
 * a nested agent working for a Health turn is Health spend, not 'main'.
 */
export function withUsageScope<T>(scope: UsageScope, fn: () => T): T {
  return scopeStorage.getStore() ? fn() : scopeStorage.run(scope, fn);
}

/** The room and mode the current call belongs to, if a turn set one. */
export function currentUsageScope(): UsageScope | undefined {
  return scopeStorage.getStore();
}

/** Where the ledger lives. */
export function usageDir(): string {
  return dirOverride ?? join(AVA_HOME, 'usage');
}

function pad(n: number, w = 2): string {
  return String(Math.abs(Math.trunc(n))).padStart(w, '0');
}

/** ISO 8601 in local time with its offset: 2026-11-21T23:40:05.120+00:00. */
export function localIso(d: Date = new Date()): string {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    + `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
    + `${sign}${pad(off / 60)}:${pad(off % 60)}`;
}

/** The local calendar day of an entry, 'YYYY-MM-DD' — read off its own stamp,
 *  so a day stays the day it was spent even if the user later travels. */
export function entryDay(e: Pick<UsageEntry, 't'>): string {
  return e.t.slice(0, 10);
}

/** Prompt tokens served from cache, under whichever name the provider uses. */
function cachedFrom(usage: Record<string, unknown> | undefined): number | undefined {
  if (!usage) return undefined;
  const details = usage.prompt_tokens_details as { cached_tokens?: unknown } | undefined;
  for (const v of [details?.cached_tokens, usage.cached_tokens, usage.prompt_cache_hit_tokens]) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return undefined;
}

/** What a reply cost, in USD, at today's rate card. Falls back to the cost the
 *  model definition worked out, when the rate card does not know the model. */
export function usageCost(model: string, provider: string, input: number, output: number, fallback?: number): number | undefined {
  const rate = usdRateFor(model, provider);
  if (rate) return (input / 1_000_000) * rate.inputPerMillion + (output / 1_000_000) * rate.outputPerMillion;
  return typeof fallback === 'number' && Number.isFinite(fallback) ? fallback : undefined;
}

/**
 * Record one reply. Never throws and never blocks the turn: a ledger that
 * cannot be written is a lost line, not a failed reply.
 */
export function recordUsage(r: {
  provider: string;
  model: string;
  usage: { prompt_tokens: number; completion_tokens: number } & Record<string, unknown>;
  mode?: string | null;
  room?: string | null;
  /** The cost the agent worked out, used only when the rate card has no rate. */
  cost?: number;
  at?: Date;
}): UsageEntry | null {
  if (!surface) return null;
  const input = Number(r.usage.prompt_tokens) || 0;
  const output = Number(r.usage.completion_tokens) || 0;
  if (input <= 0 && output <= 0) return null;
  const scope = currentUsageScope();
  const entry: UsageEntry = {
    t: localIso(r.at),
    surface,
    // Outside any turn (memory upkeep, a title, a background job) the call
    // is filed as 'background', so it is counted but never passed off as chat.
    room: r.room || scope?.room || 'background',
    mode: r.mode || scope?.mode || 'background',
    provider: r.provider || 'unknown',
    model: r.model || 'unknown',
    in: input,
    out: output,
  };
  const cached = cachedFrom(r.usage);
  if (cached !== undefined) entry.cached = cached;
  const usd = usageCost(entry.model, entry.provider, input, output, r.cost);
  if (usd !== undefined) entry.usd = Math.round(usd * 1e8) / 1e8;
  try {
    const dir = usageDir();
    mkdirSync(dir, { recursive: true });
    // One write per line with the append flag: two programs (the extension and
    // the IDE) can append to the same month without trampling each other.
    appendFileSync(join(dir, `${entry.t.slice(0, 7)}.jsonl`), JSON.stringify(entry) + '\n', 'utf-8');
  } catch { /* a lost line, never a failed reply */ }
  return entry;
}

function isEntry(v: unknown): v is UsageEntry {
  const e = v as UsageEntry;
  return !!e && typeof e.t === 'string' && typeof e.model === 'string'
    && typeof e.in === 'number' && typeof e.out === 'number';
}

/** Every month file present, 'YYYY-MM', oldest first. */
export function usageMonths(): string[] {
  try {
    return readdirSync(usageDir())
      .map((f) => /^(\d{4}-\d{2})\.jsonl$/.exec(f)?.[1])
      .filter((m): m is string => !!m)
      .sort();
  } catch { return []; }
}

/**
 * Every entry whose local day is within [from, to], both 'YYYY-MM-DD' and
 * inclusive. Omit either end for an open range. A broken line (a crash
 * mid-write) is skipped, not fatal.
 */
export function readUsage(from?: string, to?: string): UsageEntry[] {
  const out: UsageEntry[] = [];
  for (const month of usageMonths()) {
    if (from && month < from.slice(0, 7)) continue;
    if (to && month > to.slice(0, 7)) continue;
    let text: string;
    try { text = readFileSync(join(usageDir(), `${month}.jsonl`), 'utf-8'); } catch { continue; }
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      let e: unknown;
      try { e = JSON.parse(line); } catch { continue; }
      if (!isEntry(e)) continue;
      const day = entryDay(e);
      if (from && day < from) continue;
      if (to && day > to) continue;
      out.push(e);
    }
  }
  return out.sort((a, b) => a.t.localeCompare(b.t));
}

/** Totals for a group of entries. */
export interface UsageTotals {
  usd: number;
  in: number;
  out: number;
  replies: number;
  /** Replies whose cost is unknown (no rate) — so a $ total is never silently short. */
  unpriced: number;
}

export interface UsageSummary {
  totals: UsageTotals;
  /** One per local day that had usage, oldest first. */
  byDay: Array<{ day: string } & UsageTotals>;
  byModel: Array<{ model: string; provider: string } & UsageTotals>;
  byRoom: Array<{ room: string } & UsageTotals>;
  byMode: Array<{ mode: string } & UsageTotals>;
  bySurface: Array<{ surface: string } & UsageTotals>;
}

function empty(): UsageTotals {
  return { usd: 0, in: 0, out: 0, replies: 0, unpriced: 0 };
}

function add(t: UsageTotals, e: UsageEntry): void {
  t.in += e.in;
  t.out += e.out;
  t.replies += 1;
  if (typeof e.usd === 'number') t.usd += e.usd;
  else t.unpriced += 1;
}

function grouped<K extends string>(entries: UsageEntry[], keyOf: (e: UsageEntry) => string, name: K) {
  const map = new Map<string, UsageTotals>();
  for (const e of entries) {
    const k = keyOf(e);
    let t = map.get(k);
    if (!t) { t = empty(); map.set(k, t); }
    add(t, e);
  }
  return [...map.entries()].map(([k, t]) => ({ [name]: k, ...t }) as { [P in K]: string } & UsageTotals);
}

/** Sum entries every way the page needs. Biggest spend first, except days. */
export function summariseUsage(entries: UsageEntry[]): UsageSummary {
  const totals = empty();
  for (const e of entries) add(totals, e);
  const bySpend = <T extends UsageTotals>(a: T, b: T) => (b.usd - a.usd) || ((b.in + b.out) - (a.in + a.out));
  const byModel = (() => {
    const map = new Map<string, { model: string; provider: string } & UsageTotals>();
    for (const e of entries) {
      const k = `${e.provider}\u0000${e.model}`;
      let t = map.get(k);
      if (!t) { t = { model: e.model, provider: e.provider, ...empty() }; map.set(k, t); }
      add(t, e);
    }
    return [...map.values()].sort(bySpend);
  })();
  return {
    totals,
    byDay: grouped(entries, entryDay, 'day').sort((a, b) => a.day.localeCompare(b.day)),
    byModel,
    byRoom: grouped(entries, (e) => e.room, 'room').sort(bySpend),
    byMode: grouped(entries, (e) => e.mode, 'mode').sort(bySpend),
    bySurface: grouped(entries, (e) => e.surface, 'surface').sort(bySpend),
  };
}

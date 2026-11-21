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

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { AVA_HOME } from '../core/constants.js';

import { parseUsageLines, filterUsage, monthsForRange, usageCost, legacyUsageLines, type LegacyMonth, type UsageEntry, type UsageSurface } from './view.js';

// The shape of a line, the totals and everything the page works out live in
// view.ts — no file access there, so the IDE's page (which reads these files
// through Tauri) runs the same code. Re-exported so existing imports hold.
export * from './view.js';

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

/** Prompt tokens served from cache, under whichever name the provider uses. */
function cachedFrom(usage: Record<string, unknown> | undefined): number | undefined {
  if (!usage) return undefined;
  const details = usage.prompt_tokens_details as { cached_tokens?: unknown } | undefined;
  for (const v of [details?.cached_tokens, usage.cached_tokens, usage.prompt_cache_hit_tokens]) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return undefined;
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
  for (const month of monthsForRange(usageMonths(), from, to)) {
    try { out.push(...parseUsageLines(readFileSync(join(usageDir(), `${month}.jsonl`), 'utf-8'))); } catch { /* unreadable month */ }
  }
  return filterUsage(out, from, to);
}

/**
 * Bring this program's old monthly totals into the ledger — ONCE. A marker
 * file per program (`imported-<surface>`) makes a second run a no-op, so it is
 * safe to call at every start-up. Called at the first start of the version
 * that stops the old counters, so the ledger lines taken off the current month
 * are exactly the ones the old counter also counted. Never throws.
 */
export function importLegacyUsage(surface: UsageSurface, months: LegacyMonth[]): { imported: number; skipped: boolean } {
  try {
    const dir = usageDir();
    const marker = join(dir, `imported-${surface}`);
    if (existsSync(marker)) return { imported: 0, skipped: true };
    mkdirSync(dir, { recursive: true });
    const wanted = months.map((m) => m.month).sort();
    const recorded = wanted.length ? readUsage(`${wanted[0]}-01`, `${wanted[wanted.length - 1]}-31`) : [];
    const lines = legacyUsageLines(surface, months, recorded);
    for (const e of lines) appendFileSync(join(dir, `${e.t.slice(0, 7)}.jsonl`), JSON.stringify(e) + '\n', 'utf-8');
    writeFileSync(marker, `${new Date().toISOString()} ${lines.length} lines\n`, 'utf-8');
    return { imported: lines.length, skipped: false };
  } catch {
    return { imported: 0, skipped: false };
  }
}

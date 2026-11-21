// Usage timeline — everything the page works out, with no file access, so the
// extension's dashboard and the IDE (which reads ~/.ava/usage itself through
// Tauri) run the SAME code and cannot show different figures.
//
// The record itself is in ledger.ts. His call, 21 Nov 2026: a timeline where
// you look up what you spent over any period, money and tokens together, with
// a comparison against the period before, a breakdown by model, room and mode,
// and a CSV of the lines behind it.

/** Which program spent it. 'unreal' is the Assistant panel inside Unreal. */
export type UsageSurface = 'ext' | 'ide' | 'cli' | 'unreal';

/** One paid call. Short keys: this is written thousands of times a month. */
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

/** Totals for a group of entries. */
export interface UsageTotals {
  usd: number;
  in: number;
  out: number;
  replies: number;
  /** Calls whose cost is unknown (no rate) — so a $ total is never silently short. */
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

// ─── Lines ──────────────────────────────────────────────────────────────────

function isEntry(v: unknown): v is UsageEntry {
  const e = v as UsageEntry;
  return !!e && typeof e.t === 'string' && typeof e.model === 'string'
    && typeof e.in === 'number' && typeof e.out === 'number';
}

/** The local calendar day of an entry, 'YYYY-MM-DD' — read off its own stamp,
 *  so a day stays the day it was spent even if the user later travels. */
export function entryDay(e: Pick<UsageEntry, 't'>): string {
  return e.t.slice(0, 10);
}

/** Parse one month file. A broken line (a crash mid-write) is skipped. */
export function parseUsageLines(text: string): UsageEntry[] {
  const out: UsageEntry[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (isEntry(e)) out.push(e);
    } catch { /* skipped */ }
  }
  return out;
}

/** Keep the entries whose local day is within [from, to] (inclusive; either
 *  end may be open), oldest first. */
export function filterUsage(entries: UsageEntry[], from?: string, to?: string): UsageEntry[] {
  return entries
    .filter((e) => { const d = entryDay(e); return (!from || d >= from) && (!to || d <= to); })
    .sort((a, b) => a.t.localeCompare(b.t));
}

/** The month files a range needs, 'YYYY-MM', from the months present. */
export function monthsForRange(available: string[], from?: string, to?: string): string[] {
  return available.filter((m) => (!from || m >= from.slice(0, 7)) && (!to || m <= to.slice(0, 7)));
}

// ─── Totals ─────────────────────────────────────────────────────────────────

export function emptyTotals(): UsageTotals {
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
    if (!t) { t = emptyTotals(); map.set(k, t); }
    add(t, e);
  }
  return [...map.entries()].map(([k, t]) => ({ [name]: k, ...t }) as { [P in K]: string } & UsageTotals);
}

const bySpend = <T extends UsageTotals>(a: T, b: T) => (b.usd - a.usd) || ((b.in + b.out) - (a.in + a.out));

/** Sum entries every way the page needs. Biggest spend first, except days. */
export function summariseUsage(entries: UsageEntry[]): UsageSummary {
  const totals = emptyTotals();
  for (const e of entries) add(totals, e);
  const models = new Map<string, { model: string; provider: string } & UsageTotals>();
  for (const e of entries) {
    const k = `${e.provider}\u0000${e.model}`;
    let t = models.get(k);
    if (!t) { t = { model: e.model, provider: e.provider, ...emptyTotals() }; models.set(k, t); }
    add(t, e);
  }
  return {
    totals,
    byDay: grouped(entries, entryDay, 'day').sort((a, b) => a.day.localeCompare(b.day)),
    byModel: [...models.values()].sort(bySpend),
    byRoom: grouped(entries, (e) => e.room, 'room').sort(bySpend),
    byMode: grouped(entries, (e) => e.mode, 'mode').sort(bySpend),
    bySurface: grouped(entries, (e) => e.surface, 'surface').sort(bySpend),
  };
}

// ─── Ranges ─────────────────────────────────────────────────────────────────

export type UsageRangeKey = 'today' | '7d' | '30d' | 'month' | 'last_month' | 'all' | 'custom';
export const USAGE_RANGE_KEYS: UsageRangeKey[] = ['today', '7d', '30d', 'month', 'last_month', 'all', 'custom'];

/** A local calendar day as 'YYYY-MM-DD'. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' → a local Date at midday (midday, so a clock change never
 *  pushes it into the next or previous day). */
export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12);
}

function addDays(day: string, n: number): string {
  const d = parseDay(day);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

function daysBetween(from: string, to: string): number {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86_400_000);
}

export interface DayRange { from?: string; to?: string }

/**
 * The days a preset covers, on the user's own calendar. 'all' is open at the
 * start (the page fills it from the first entry). 'custom' passes through.
 */
export function rangeFor(key: UsageRangeKey, now: Date = new Date(), custom?: DayRange): DayRange {
  const today = dayKey(now);
  switch (key) {
    case 'today': return { from: today, to: today };
    case '7d': return { from: addDays(today, -6), to: today };
    case '30d': return { from: addDays(today, -29), to: today };
    case 'month': return { from: `${today.slice(0, 7)}-01`, to: today };
    case 'last_month': {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1, 12);
      const last = new Date(now.getFullYear(), now.getMonth(), 0, 12);
      return { from: dayKey(first), to: dayKey(last) };
    }
    case 'all': return { to: today };
    case 'custom': {
      let { from, to } = custom ?? {};
      if (from && to && from > to) [from, to] = [to, from];
      return { from, to: to ?? today };
    }
  }
}

/**
 * The period a range is compared against. Months compare with the same days
 * of the month before (1–21 Nov against 1–21 Oct), because "this month so far"
 * against the 21 days before it would mix two months and mean nothing. Every
 * other range compares with the same number of days just before it. 'all' and
 * an open range have nothing before them.
 */
export function previousRange(key: UsageRangeKey, range: DayRange): DayRange | null {
  const { from, to } = range;
  if (key === 'all' || !from || !to) return null;
  if (key === 'month' || key === 'last_month') {
    const f = parseDay(from);
    const t = parseDay(to);
    const pf = new Date(f.getFullYear(), f.getMonth() - 1, 1, 12);
    const lastOfPrev = new Date(f.getFullYear(), f.getMonth(), 0, 12).getDate();
    const pt = new Date(f.getFullYear(), f.getMonth() - 1, Math.min(t.getDate(), lastOfPrev), 12);
    return { from: dayKey(pf), to: dayKey(pt) };
  }
  const span = daysBetween(from, to);
  return { from: addDays(from, -(span + 1)), to: addDays(from, -1) };
}

/** Percentage change, or null when there is nothing to compare with. */
export function changePct(now: number, before: number): number | null {
  if (!(before > 0)) return null;
  return ((now - before) / before) * 100;
}

// ─── Bars ───────────────────────────────────────────────────────────────────

export type UsageBucket = 'day' | 'week' | 'month';

/** Days up to two months, weeks up to about a year, months beyond. Keeps the
 *  bar count readable (≤ ~60) whatever the range. */
export function bucketFor(from: string, to: string): UsageBucket {
  const span = daysBetween(from, to) + 1;
  if (span <= 62) return 'day';
  if (span <= 371) return 'week';
  return 'month';
}

/** The first day of the bucket a day falls in. Weeks start on Monday. */
export function bucketStart(day: string, bucket: UsageBucket): string {
  if (bucket === 'day') return day;
  if (bucket === 'month') return `${day.slice(0, 7)}-01`;
  const d = parseDay(day);
  const back = (d.getDay() + 6) % 7; // Monday → 0
  return addDays(day, -back);
}

function nextBucket(start: string, bucket: UsageBucket): string {
  if (bucket === 'day') return addDays(start, 1);
  if (bucket === 'week') return addDays(start, 7);
  const d = parseDay(start);
  return dayKey(new Date(d.getFullYear(), d.getMonth() + 1, 1, 12));
}

export interface UsageBar extends UsageTotals {
  /** First day of the bar. */
  start: string;
  /** Last day of the bar, clipped to the range. */
  end: string;
}

/** One bar per bucket across the WHOLE range — empty days show as empty, so a
 *  quiet week reads as quiet, not as missing. */
export function usageBars(entries: UsageEntry[], from: string, to: string, bucket: UsageBucket = bucketFor(from, to)): UsageBar[] {
  const bars: UsageBar[] = [];
  const index = new Map<string, UsageBar>();
  for (let s = bucketStart(from, bucket); s <= to; s = nextBucket(s, bucket)) {
    const end = addDays(nextBucket(s, bucket), -1);
    const bar: UsageBar = { start: s < from ? from : s, end: end > to ? to : end, ...emptyTotals() };
    bars.push(bar);
    index.set(s, bar);
    if (bars.length > 2000) break; // a guard, never reached by a sane range
  }
  for (const e of entries) {
    const day = entryDay(e);
    if (day < from || day > to) continue;
    const bar = index.get(bucketStart(day, bucket));
    if (bar) add(bar, e);
  }
  return bars;
}

// ─── The page ───────────────────────────────────────────────────────────────

export interface UsageView {
  range: { from: string; to: string };
  bucket: UsageBucket;
  summary: UsageSummary;
  /** The period before, for "vs previous period"; null when there is none. */
  previous: { range: DayRange; totals: UsageTotals } | null;
  bars: UsageBar[];
}

/**
 * Everything the page shows for a range. `entries` must cover the range and,
 * when there is one, the period before it (see previousRange).
 */
export function buildUsageView(entries: UsageEntry[], key: UsageRangeKey, range: DayRange, now: Date = new Date()): UsageView {
  const sorted = [...entries].sort((a, b) => a.t.localeCompare(b.t));
  const to = range.to ?? dayKey(now);
  // An open start ('all') begins at the first thing ever recorded.
  const from = range.from ?? (sorted.length ? entryDay(sorted[0]) : to);
  const inRange = filterUsage(sorted, from, to);
  const prev = previousRange(key, { from, to });
  const bucket = bucketFor(from, to);
  return {
    range: { from, to },
    bucket,
    summary: summariseUsage(inRange),
    previous: prev ? { range: prev, totals: summariseUsage(filterUsage(sorted, prev.from, prev.to)).totals } : null,
    bars: usageBars(inRange, from, to, bucket),
  };
}

/** The days the page must load for a range: the range plus the period before. */
export function daysToLoad(key: UsageRangeKey, range: DayRange): DayRange {
  const prev = previousRange(key, range);
  return { from: prev?.from ?? range.from, to: range.to };
}

// ─── Export ─────────────────────────────────────────────────────────────────

function csvCell(v: unknown): string {
  const s = v === undefined || v === null ? '' : String(v);
  // Quote anything with a comma, quote or newline, and anything a spreadsheet
  // would read as a formula (=, +, -, @), so a model name can never run as one.
  if (/[",\n\r]/.test(s) || /^[=+\-@]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Every line in the range as CSV — the same lines every total is summed from. */
export function usageCsv(entries: UsageEntry[]): string {
  const head = ['time', 'program', 'room', 'mode', 'provider', 'model', 'input_tokens', 'output_tokens', 'cached_tokens', 'estimated_usd'];
  const rows = entries.map((e) => [e.t, e.surface, e.room, e.mode, e.provider, e.model, e.in, e.out, e.cached, e.usd].map(csvCell).join(','));
  return [head.join(','), ...rows].join('\r\n') + '\r\n';
}

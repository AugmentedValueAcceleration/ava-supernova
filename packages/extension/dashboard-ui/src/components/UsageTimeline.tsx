// The Usage timeline (his call, 21 Nov 2026; plan 2026-11-21-usage-timeline).
//
// Look up what you spent over any period — money and tokens together — with a
// comparison against the period before, a bar per day (week, month on longer
// ranges) you can click into, a breakdown by model, room or mode, and a CSV of
// the lines behind it.
//
// The host reads ~/.ava/usage; every figure here is worked out by core's
// usage/view.ts — the same code the IDE's page runs, so the two cannot differ.
// The IDE mirror is UsageTimeline in packages/ide/src/components.

import { useEffect, useMemo, useRef, useState } from 'react';
import { t, tt, useLocale } from '../i18n';
import { post } from '../App';
import { DateField } from './DateField';
import {
  buildUsageView, changePct, daysToLoad, filterUsage, rangeFor, summariseUsage,
  USAGE_RANGE_KEYS, type UsageBar, type UsageEntry, type UsageRangeKey, type UsageTotals,
} from '@ava/core/usage/view';

const STORE_KEY = 'ava.usage.timeline';

interface Saved { key: UsageRangeKey; from?: string; to?: string; metric: 'usd' | 'tokens'; by: 'model' | 'room' | 'mode' }

function loadSaved(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null') as Partial<Saved> | null;
    if (s && USAGE_RANGE_KEYS.includes(s.key as UsageRangeKey)) {
      return { key: s.key as UsageRangeKey, from: s.from, to: s.to, metric: s.metric === 'tokens' ? 'tokens' : 'usd', by: s.by === 'room' || s.by === 'mode' ? s.by : 'model' };
    }
  } catch { /* first visit, or storage blocked */ }
  return { key: 'month', metric: 'usd', by: 'model' };
}

// ─── Words ──────────────────────────────────────────────────────────────────

export function rangeLabel(k: UsageRangeKey): string {
  const en: Record<UsageRangeKey, string> = {
    today: 'Today', '7d': '7 days', '30d': '30 days', month: 'This month', last_month: 'Last month', all: 'All time', custom: 'Custom',
  };
  return tt(`dash.usage.tl.range.${k}`, en[k]);
}

const ROOM_EN: Record<string, string> = {
  main: 'Main chat', health: 'Health', learning: 'Learning', design: 'Design Studio', social: 'Posts',
  brainstorm: 'Brainstorm', background: 'Background',
};
export function roomLabel(id: string): string {
  return tt(`dash.usage.tl.room.${id}`, ROOM_EN[id] ?? id);
}

const MODE_EN: Record<string, string> = {
  'work:talking': 'Code (Talk)', health: 'Health Room', design: 'Design Studio', social: 'Posts', news: 'Newsroom',
  pantry: 'Pantry', gym: 'Gym', classroom: 'Classroom', background: 'Background',
};
export function modeLabel(id: string): string {
  const own = t(`mode.${id}`);
  if (own !== `mode.${id}`) return own;
  return tt(`dash.usage.tl.mode.${id.replace(':', '_')}`, MODE_EN[id] ?? id.charAt(0).toUpperCase() + id.slice(1));
}

export function money(usd: number): string {
  if (usd === 0) return '$0.00';
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd >= 0.01) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(4)}`;
}

export function tokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(Math.round(n));
}

function dayText(day: string, locale: string, withYear = false): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString(locale || undefined, { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
}

function barText(b: UsageBar, bucket: string, locale: string): string {
  if (bucket === 'month') {
    const [y, m] = b.start.split('-').map(Number);
    return new Date(y, m - 1, 1, 12).toLocaleDateString(locale || undefined, { month: 'long', year: 'numeric' });
  }
  return b.start === b.end ? dayText(b.start, locale, true) : `${dayText(b.start, locale)} – ${dayText(b.end, locale, true)}`;
}

// ─── Pieces ─────────────────────────────────────────────────────────────────

function Change({ now, before }: { now: number; before: number | undefined }) {
  if (before === undefined) return null;
  const pct = changePct(now, before);
  if (pct === null) return <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{tt('dash.usage.tl.no_previous', 'nothing in the period before')}</p>;
  const up = pct > 0.5;
  const down = pct < -0.5;
  // Spending more is not "bad" and less is not "good" — it is just a fact
  // about the period, so it is shown in the neutral colour, with an arrow.
  return (
    <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
      {up ? '▲' : down ? '▼' : '='} {Math.abs(pct).toFixed(0)}% {tt('dash.usage.tl.vs_previous', 'vs the period before')}
    </p>
  );
}

function Headline({ label, value, sub, now, before }: { label: string; value: string; sub?: string; now: number; before?: number }) {
  return (
    <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4">
      <p className="text-[10px] text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{sub}</p>}
      <Change now={now} before={before} />
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition ${active
        ? 'border-[var(--accent)]/50 bg-[var(--accent)]/15 text-[var(--accent)]'
        : 'border-[var(--border-card)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
    >{children}</button>
  );
}

/** Plain SVG bars — no chart library. One per bucket across the whole range. */
function Bars({ bars, metric, bucket, selected, onSelect, locale }: {
  bars: UsageBar[]; metric: 'usd' | 'tokens'; bucket: string; selected: string | null;
  onSelect: (b: UsageBar | null) => void; locale: string;
}) {
  const value = (b: UsageBar) => (metric === 'usd' ? b.usd : b.in + b.out);
  const max = Math.max(0, ...bars.map(value));
  const W = 100 / Math.max(bars.length, 1);
  const H = 120;
  const fmt = (b: UsageBar) => (metric === 'usd' ? money(b.usd) : `${tokens(b.in + b.out)} ${tt('dash.usage.tl.tokens_word', 'tokens')}`);
  return (
    <div>
      <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="h-36 w-full" role="img" aria-label={tt('dash.usage.tl.timeline', 'Timeline')}>
        <line x1="0" y1={H - 0.5} x2="100" y2={H - 0.5} stroke="var(--border-card)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {bars.map((b, i) => {
          const v = value(b);
          const h = max > 0 ? Math.max(v > 0 ? 2 : 0, (v / max) * (H - 6)) : 0;
          const isSel = selected === b.start;
          return (
            <g key={b.start} onClick={() => onSelect(isSel ? null : b)} style={{ cursor: b.replies ? 'pointer' : 'default' }}>
              {/* A full-height hit area, so a small bar is still easy to click. */}
              <rect x={i * W} y={0} width={W} height={H} fill="transparent">
                <title>{`${barText(b, bucket, locale)}: ${fmt(b)} · ${b.replies} ${tt('dash.usage.tl.calls_word', 'calls')}`}</title>
              </rect>
              <rect
                x={i * W + W * 0.15} y={H - h} width={W * 0.7} height={h} rx="0.6"
                fill={isSel ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 55%, transparent)'}
                pointerEvents="none"
              />
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-[var(--text-muted)]">
        <span>{bars.length ? barText(bars[0], bucket, locale) : ''}</span>
        <span>{bars.length > 1 ? barText(bars[bars.length - 1], bucket, locale) : ''}</span>
      </div>
    </div>
  );
}

// ─── The page ───────────────────────────────────────────────────────────────

export function UsageTimeline() {
  const locale = useLocale();
  const [saved, setSaved] = useState<Saved>(loadSaved);
  const [entries, setEntries] = useState<UsageEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<UsageBar | null>(null);
  const requestRef = useRef(0);

  const update = (next: Partial<Saved>) => setSaved((s) => {
    const v = { ...s, ...next };
    try { localStorage.setItem(STORE_KEY, JSON.stringify(v)); } catch { /* a convenience only */ }
    return v;
  });

  const range = useMemo(() => rangeFor(saved.key, new Date(), { from: saved.from, to: saved.to }), [saved.key, saved.from, saved.to]);

  // Ask the host for the lines this range needs (and the period before it).
  const load = () => {
    const want = daysToLoad(saved.key, range);
    const requestId = ++requestRef.current;
    post({ type: 'load_usage_ledger', from: want.from, to: want.to, requestId });
  };

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      const msg = ev.data as { type?: string; requestId?: number; entries?: UsageEntry[] };
      if (msg?.type === 'usage_ledger_loaded') {
        // A slow answer for a range the user has already left is dropped.
        if (msg.requestId !== undefined && msg.requestId !== requestRef.current) return;
        setEntries(Array.isArray(msg.entries) ? msg.entries : []);
        setLoaded(true);
      } else if (msg?.type === 'usage_ledger_changed') {
        load();
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  });

  useEffect(() => { setSelected(null); load(); }, [saved.key, range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps

  const view = useMemo(() => buildUsageView(entries, saved.key, range), [entries, saved.key, range]);
  const { totals } = view.summary;
  const before: UsageTotals | undefined = view.previous?.totals;

  // A clicked bar narrows the breakdown to its days.
  const breakdownSummary = useMemo(
    () => (selected ? summariseUsage(filterUsage(entries, selected.start, selected.end)) : view.summary),
    [selected, entries, view.summary],
  );
  const rows = (saved.by === 'model'
    ? breakdownSummary.byModel.map((m) => ({ key: `${m.provider}:${m.model}`, label: m.model, sub: m.provider, ...m }))
    : saved.by === 'room'
      ? breakdownSummary.byRoom.map((r) => ({ key: r.room, label: roomLabel(r.room), sub: '', ...r }))
      : breakdownSummary.byMode.map((r) => ({ key: r.mode, label: modeLabel(r.mode), sub: '', ...r })));
  const top = Math.max(0, ...rows.map((r) => (saved.metric === 'usd' ? r.usd : r.in + r.out)));

  return (
    <div className="space-y-6">
      {/* Range */}
      <div className="flex flex-wrap items-center gap-1.5">
        {USAGE_RANGE_KEYS.map((k) => (
          <Chip key={k} active={saved.key === k} onClick={() => update({ key: k })}>{rangeLabel(k)}</Chip>
        ))}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => post({ type: 'export_usage_csv', from: view.range.from, to: view.range.to })}
          disabled={totals.replies === 0}
          className="rounded-md border border-[var(--border-card)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition hover:border-[var(--accent)]/45 disabled:opacity-40"
        >{tt('dash.usage.tl.export', 'Export CSV')}</button>
      </div>
      {saved.key === 'custom' && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)]">
          <span>{tt('dash.usage.tl.from', 'From')}</span>
          <DateField size="sm" value={saved.from ?? null} onChange={(v) => update({ from: v ?? undefined })} />
          <span>{tt('dash.usage.tl.to', 'to')}</span>
          <DateField size="sm" value={saved.to ?? null} onChange={(v) => update({ to: v ?? undefined })} />
        </div>
      )}
      <p className="text-[11px] text-[var(--text-muted)]">
        {view.range.from === view.range.to
          ? dayText(view.range.from, locale, true)
          : `${dayText(view.range.from, locale, true)} – ${dayText(view.range.to, locale, true)}`}
      </p>

      {/* Totals for the range, money and tokens side by side */}
      <div className="grid grid-cols-3 gap-3">
        <Headline label={t('dash.usage.estimated_cost')} value={money(totals.usd)} now={totals.usd} before={before?.usd} />
        <Headline
          label={t('dash.usage.total_tokens')}
          value={tokens(totals.in + totals.out)}
          sub={`${t('status.in')} ${tokens(totals.in)} · ${t('status.out')} ${tokens(totals.out)}`}
          now={totals.in + totals.out}
          before={before ? before.in + before.out : undefined}
        />
        <Headline label={tt('dash.usage.tl.calls', 'Calls')} value={String(totals.replies)} now={totals.replies} before={before?.replies} />
      </div>
      {totals.unpriced > 0 && (
        <p className="text-[10px] text-[var(--text-muted)]">
          {t('dash.usage.tl.unpriced', { count: totals.unpriced })}
        </p>
      )}

      {/* Timeline */}
      <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            {view.bucket === 'day' ? tt('dash.usage.tl.per_day', 'Per day') : view.bucket === 'week' ? tt('dash.usage.tl.per_week', 'Per week') : tt('dash.usage.tl.per_month', 'Per month')}
          </span>
          <div className="flex gap-1">
            <Chip active={saved.metric === 'usd'} onClick={() => update({ metric: 'usd' })}>$</Chip>
            <Chip active={saved.metric === 'tokens'} onClick={() => update({ metric: 'tokens' })}>{tt('dash.usage.tl.tokens', 'Tokens')}</Chip>
          </div>
        </div>
        {loaded && totals.replies === 0
          ? <p className="py-8 text-center text-xs text-[var(--text-muted)]">{tt('dash.usage.tl.empty', 'Nothing spent in this period.')}</p>
          : <Bars bars={view.bars} metric={saved.metric} bucket={view.bucket} selected={selected?.start ?? null} onSelect={setSelected} locale={locale} />}
      </div>

      {/* Breakdown */}
      <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            {selected
              ? <>{barText(selected, view.bucket, locale)} <button type="button" className="ml-1 normal-case tracking-normal text-[var(--accent)]" onClick={() => setSelected(null)}>{tt('dash.usage.tl.whole_period', 'show the whole period')}</button></>
              : tt('dash.usage.tl.breakdown', 'Where it went')}
          </span>
          <div className="flex gap-1">
            <Chip active={saved.by === 'model'} onClick={() => update({ by: 'model' })}>{tt('dash.usage.tl.by_model', 'Model')}</Chip>
            <Chip active={saved.by === 'room'} onClick={() => update({ by: 'room' })}>{tt('dash.usage.tl.by_room', 'Room')}</Chip>
            <Chip active={saved.by === 'mode'} onClick={() => update({ by: 'mode' })}>{tt('dash.usage.tl.by_mode', 'Mode')}</Chip>
          </div>
        </div>
        {rows.length === 0
          ? <p className="py-4 text-center text-xs text-[var(--text-muted)]">{tt('dash.usage.tl.empty', 'Nothing spent in this period.')}</p>
          : (
            <div className="space-y-3">
              {rows.map((r) => {
                const v = saved.metric === 'usd' ? r.usd : r.in + r.out;
                return (
                  <div key={r.key}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-[11px]">
                      <span className="truncate font-medium">{r.label}{r.sub && <span className="ml-1.5 text-[10px] font-normal text-[var(--text-muted)]">{r.sub}</span>}</span>
                      <span className="shrink-0 text-[var(--text-muted)]">
                        {money(r.usd)} · {tokens(r.in + r.out)} · {r.replies} {tt('dash.usage.tl.calls_word', 'calls')}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-input)]">
                      <div className="h-full rounded-full bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)]" style={{ width: `${top > 0 ? (v / top) * 100 : 0}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        <p className="mt-3 text-[10px] text-[var(--text-muted)]">{t('dash.usage.est_note')}</p>
      </div>
    </div>
  );
}

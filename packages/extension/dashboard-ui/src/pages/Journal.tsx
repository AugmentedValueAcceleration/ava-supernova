import { useState, useMemo } from 'react';
import { t, useLocale } from '../i18n';
import { Skeleton } from '../components/Skeleton';
import { MiniDatePicker } from '../components/MiniDatePicker';
import { post } from '../vscode';
import { MarkdownRenderer } from '../chat/components/MarkdownRenderer';
import type {
  DashboardJournalMonthEntry,
  DashboardJournalKind,
  DashboardJournalSearchHit,
  DashboardJournalDaySummary,
} from '../types/messages';

interface JournalProps {
  year: number;
  month: number; // 1-12
  monthEntries: DashboardJournalMonthEntry[];
  kinds: DashboardJournalKind[];
  searchHits: DashboardJournalSearchHit[] | null;
  yearSummaries: DashboardJournalDaySummary[];
  loaded: boolean;
  onChangeMonth: (year: number, month: number) => void;
  onClearSearch: () => void;
}

// Mood → heat colour (1 low … 5 great). Days with entries but no mood get a neutral tint.
const HEAT_NEUTRAL = 'rgba(168,85,247,0.22)';
function heatColor(s: DashboardJournalDaySummary | undefined): string {
  if (!s || s.count === 0) return 'rgba(255,255,255,0.04)';
  if (s.avg_mood == null) return HEAT_NEUTRAL;
  return MOOD_COLORS[Math.max(1, Math.min(5, Math.round(s.avg_mood)))];
}

const MOOD_LABEL_KEYS = ['', 'dash.journal.mood_rough', 'dash.journal.mood_low', 'dash.journal.mood_okay', 'dash.journal.mood_good', 'dash.journal.mood_great'];
const MOOD_COLORS = ['', '#ef4444', '#f59e0b', '#6b7280', '#3b82f6', '#34d399'];
const NEUTRAL = '#6b7280';
const KIND_COLORS = ['#a855f7', '#34d399', '#f59e0b', '#3b82f6', '#ef4444', '#ec4899', '#14b8a6', '#eab308', '#8b5cf6', '#06b6d4'];
const LAST_KIND_KEY = 'ava-journal-last-kind';
const readLastKind = () => { try { return localStorage.getItem(LAST_KIND_KEY) || 'personal'; } catch { return 'personal'; } };

const todayIso = () => new Date().toISOString().slice(0, 10);
const monthName = (year: number, month: number) => new Date(year, month - 1, 1).toLocaleString(undefined, { month: 'short' });
const dayNum = (iso: string) => iso.split('-')[2] ?? '';
const formatDate = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };

function kindOf(kinds: DashboardJournalKind[], id: string): DashboardJournalKind {
  return kinds.find((k) => k.id === id) ?? { id, label: id, color: NEUTRAL, tracksMood: false, builtin: false };
}

// ── Draft for the composer / editor ──────────────────────────────────────────
interface Draft {
  id?: string; // present when editing
  date: string;
  kind: string;
  title: string;
  content: string;
  mood?: number;
  tags: string;
}

export function Journal({ year, month, monthEntries, kinds, searchHits, yearSummaries, loaded, onChangeMonth, onClearSearch }: JournalProps) {
  useLocale();
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [filterKind, setFilterKind] = useState<string | null>(null);
  const [filterAuthor, setFilterAuthor] = useState<'user' | 'ava' | null>(null);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showKinds, setShowKinds] = useState(false);

  const thisYear = new Date().getFullYear();
  const years = useMemo(() => {
    const span = new Set<number>([thisYear, year]);
    for (let y = thisYear; y >= thisYear - 4; y--) span.add(y);
    return [...span].sort((a, b) => b - a);
  }, [thisYear, year]);

  const visible = useMemo(() => {
    let rows = [...monthEntries];
    if (filterKind) rows = rows.filter((e) => e.kind === filterKind);
    if (filterAuthor) rows = rows.filter((e) => e.author === filterAuthor);
    // Newest first within the month.
    return rows.sort((a, b) => (a.date === b.date ? b.created_at.localeCompare(a.created_at) : b.date.localeCompare(a.date)));
  }, [monthEntries, filterKind, filterAuthor]);

  const openEntry = openId ? monthEntries.find((e) => e.id === openId) ?? null : null;

  const submitSearch = () => {
    const q = query.trim();
    if (q) post({ type: 'journal_search', query: q });
  };

  const startNew = () => setDraft({ date: todayIso(), kind: readLastKind(), title: '', content: '', mood: undefined, tags: '' });
  const startEdit = (e: DashboardJournalMonthEntry) => {
    setOpenId(null);
    setDraft({ id: e.id, date: e.date, kind: e.kind, title: e.title ?? '', content: e.content, mood: e.mood, tags: (e.tags ?? []).join(', ') });
  };

  const saveDraft = () => {
    if (!draft || !draft.content.trim()) return;
    try { localStorage.setItem(LAST_KIND_KEY, draft.kind); } catch { /* ignore */ }
    const tags = draft.tags.split(',').map((s) => s.trim()).filter(Boolean);
    const tracksMood = kindOf(kinds, draft.kind).tracksMood;
    const mood = tracksMood ? draft.mood : undefined;
    if (draft.id) {
      post({ type: 'journal_update_entry', date: draft.date, id: draft.id, kind: draft.kind, title: draft.title, content: draft.content, mood: mood ?? null, tags });
    } else {
      post({ type: 'journal_add_entry', date: draft.date, author: 'user', kind: draft.kind, title: draft.title, content: draft.content, mood, tags });
      // Make sure the new entry's month is the one shown.
      const [yy, mm] = draft.date.split('-').map(Number);
      if (yy !== year || mm !== month) onChangeMonth(yy, mm);
    }
    setDraft(null);
  };

  const deleteEntry = (e: DashboardJournalMonthEntry) => {
    post({ type: 'journal_delete_entry', date: e.date, id: e.id });
    setOpenId(null);
    setConfirmDelete(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header: year + new entry */}
      <div className="flex items-center gap-3 mb-3">
        <h1 className="text-[22px] font-semibold text-[#cdd6f4]">Journal</h1>
        <select
          value={year}
          onChange={(e) => onChangeMonth(Number(e.target.value), month)}
          className="text-xs rounded-md px-2 py-1 bg-[var(--bg-input)] text-[var(--text-secondary)] border border-[var(--border-card)] cursor-pointer outline-none"
        >
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <button
          onClick={() => setShowHeatmap((s) => !s)}
          className="px-2.5 py-1 rounded-md text-[11px] border border-[var(--border-card)] cursor-pointer transition"
          style={{ color: showHeatmap ? '#fff' : 'var(--text-muted)', background: showHeatmap ? 'rgba(168,85,247,0.15)' : 'transparent' }}
          title={t('dash.journal.year_view')}
        >
          {t('dash.journal.year_view')}
        </button>
        <div className="flex-1" />
        <button
          onClick={startNew}
          className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white border-none cursor-pointer transition"
          style={{ background: '#A855F7' }}
        >
          + {t('dash.journal.write_entry')}
        </button>
      </div>

      {/* Year heatmap */}
      {showHeatmap && (
        <div className="mb-3 p-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)]">
          <YearHeatmap year={year} summaries={yearSummaries} onJump={(iso) => { const [yy, mm] = iso.split('-').map(Number); onChangeMonth(yy, mm); }} />
        </div>
      )}

      {/* Month tabs */}
      <div className="flex flex-wrap gap-1 mb-3">
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
          <button
            key={m}
            onClick={() => onChangeMonth(year, m)}
            className="px-3 py-1.5 rounded-md text-xs font-medium border-none cursor-pointer transition"
            style={{
              background: m === month ? '#A855F7' : 'var(--bg-input)',
              color: m === month ? '#fff' : 'var(--text-muted)',
            }}
          >
            {monthName(year, m)}
          </button>
        ))}
      </div>

      {/* Filters + search */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <button
          onClick={() => setFilterKind(null)}
          className="px-2.5 py-1 rounded-full text-[11px] border cursor-pointer transition"
          style={{ borderColor: filterKind === null ? '#A855F7' : 'var(--border-card)', color: filterKind === null ? '#fff' : 'var(--text-muted)', background: 'transparent' }}
        >
          {t('dash.journal.all_kinds')}
        </button>
        {kinds.map((k) => (
          <button
            key={k.id}
            onClick={() => setFilterKind(filterKind === k.id ? null : k.id)}
            className="px-2.5 py-1 rounded-full text-[11px] border cursor-pointer transition inline-flex items-center gap-1.5"
            style={{ borderColor: filterKind === k.id ? k.color : 'var(--border-card)', color: filterKind === k.id ? '#fff' : 'var(--text-muted)', background: 'transparent' }}
          >
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: k.color }} />
            {k.label}
          </button>
        ))}
        <button onClick={() => setShowKinds(true)} title={t('dash.journal.manage_kinds')} className="px-2 py-1 rounded-full text-[11px] border border-[var(--border-card)] text-[var(--text-muted)] hover:text-white bg-transparent cursor-pointer transition">⚙</button>
        <span className="mx-1 w-px h-4 self-center" style={{ background: 'var(--border-card)' }} />
        {([['user', 'dash.journal.filter_you'], ['ava', 'dash.journal.filter_ava']] as const).map(([a, key]) => (
          <button
            key={a}
            onClick={() => setFilterAuthor(filterAuthor === a ? null : a)}
            className="px-2.5 py-1 rounded-full text-[11px] border cursor-pointer transition"
            style={{ borderColor: filterAuthor === a ? '#A855F7' : 'var(--border-card)', color: filterAuthor === a ? '#fff' : 'var(--text-muted)', background: 'transparent' }}
          >
            {t(key)}
          </button>
        ))}
        <div className="flex-1" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submitSearch(); }}
          placeholder={t('dash.journal.search_placeholder')}
          className="text-xs rounded-md px-2.5 py-1.5 bg-[var(--bg-input)] text-[var(--text-secondary)] border border-[var(--border-card)] outline-none w-44"
        />
      </div>

      {/* Body */}
      <div className="flex-1 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] overflow-y-auto">
        {!loaded ? (
          <div className="space-y-3 p-5">
            <Skeleton height={12} width="30%" /><Skeleton height={12} /><Skeleton height={12} width="80%" />
          </div>
        ) : searchHits ? (
          <SearchResults hits={searchHits} kinds={kinds} onClear={() => { setQuery(''); onClearSearch(); }} onJump={(iso) => { const [yy, mm] = iso.split('-').map(Number); onChangeMonth(yy, mm); onClearSearch(); }} />
        ) : visible.length === 0 ? (
          <EmptyMonth onNew={startNew} />
        ) : (
          <ul className="divide-y divide-[var(--border-card)]">
            {visible.map((e) => {
              const k = kindOf(kinds, e.kind);
              return (
                <li key={e.id}>
                  <button onClick={() => setOpenId(e.id)} className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-white/5 border-none bg-transparent cursor-pointer transition">
                    <span className="mt-1 flex flex-col items-center w-9 shrink-0">
                      <span className="text-[15px] font-semibold text-[var(--text-secondary)] leading-none">{dayNum(e.date)}</span>
                      <span className="text-[9px] text-[var(--text-muted)] mt-0.5">{monthName(year, month)}</span>
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium inline-flex items-center gap-1" style={{ background: `${k.color}22`, color: k.color }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: k.color }} />{k.label}
                        </span>
                        {e.author === 'ava' && <span className="text-[10px]" style={{ color: '#A855F7' }}>{t('dash.journal.ava_label')}</span>}
                        {e.mood && <span className="w-2 h-2 rounded-full" style={{ background: MOOD_COLORS[e.mood] }} title={t(MOOD_LABEL_KEYS[e.mood])} />}
                      </span>
                      {e.title && <span className="block text-sm font-medium text-[var(--text-primary,#e5e5e5)] truncate">{e.title}</span>}
                      <span className="block text-xs text-[var(--text-muted)] truncate">{e.content.split('\n')[0]}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Entry viewer overlay */}
      {openEntry && !draft && (
        <EntryViewer
          entry={openEntry}
          kind={kindOf(kinds, openEntry.kind)}
          confirmDelete={confirmDelete}
          onClose={() => { setOpenId(null); setConfirmDelete(false); }}
          onEdit={() => startEdit(openEntry)}
          onAskDelete={() => setConfirmDelete(true)}
          onConfirmDelete={() => deleteEntry(openEntry)}
          onCancelDelete={() => setConfirmDelete(false)}
        />
      )}

      {/* Composer / editor overlay */}
      {draft && (
        <EntryComposer
          draft={draft}
          kinds={kinds}
          onChange={setDraft}
          onSave={saveDraft}
          onCancel={() => setDraft(null)}
        />
      )}

      {/* Custom-kind manager */}
      {showKinds && <KindManager kinds={kinds} onClose={() => setShowKinds(false)} />}
    </div>
  );
}

// ── Year heatmap ──────────────────────────────────────────────────────────────

function YearHeatmap({ year, summaries, onJump }: { year: number; summaries: DashboardJournalDaySummary[]; onJump: (iso: string) => void }) {
  const byDate = useMemo(() => {
    const m = new Map<string, DashboardJournalDaySummary>();
    for (const s of summaries) m.set(s.date, s);
    return m;
  }, [summaries]);

  const weeks = useMemo(() => {
    const start = new Date(year, 0, 1);
    start.setDate(start.getDate() - start.getDay()); // back to the preceding Sunday
    const end = new Date(year, 11, 31);
    const out: Date[][] = [];
    const cur = new Date(start);
    while (cur <= end) {
      const week: Date[] = [];
      for (let d = 0; d < 7; d++) { week.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
      out.push(week);
    }
    return out;
  }, [year]);

  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-[3px]">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map((d, di) => {
              const inYear = d.getFullYear() === year;
              const s = inYear ? byDate.get(iso(d)) : undefined;
              return (
                <button
                  key={di}
                  title={inYear ? `${iso(d)}${s ? ` · ${s.count}` : ''}` : ''}
                  onClick={() => { if (inYear) onJump(iso(d)); }}
                  className="rounded-[2px] border-none"
                  style={{ width: 11, height: 11, background: inYear ? heatColor(s) : 'transparent', cursor: inYear ? 'pointer' : 'default' }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Custom-kind manager ───────────────────────────────────────────────────────

function KindManager({ kinds, onClose }: { kinds: DashboardJournalKind[]; onClose: () => void }) {
  const [label, setLabel] = useState('');
  const [color, setColor] = useState(KIND_COLORS[0]);
  const [tracksMood, setTracksMood] = useState(false);

  const add = () => {
    const l = label.trim();
    if (!l) return;
    const id = l.toLowerCase().replace(/\s+/g, '-');
    post({ type: 'journal_add_kind', id, label: l, color, tracksMood });
    setLabel('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-md mx-4 rounded-2xl border border-[#A855F7]/20 bg-[var(--bg-card)] shadow-2xl flex flex-col" style={{ maxHeight: '85vh' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <p className="text-sm font-semibold text-white">{t('dash.journal.manage_kinds')}</p>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white/50 hover:text-white hover:bg-white/10 border-none cursor-pointer transition">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-2 min-h-0">
          {kinds.map((k) => (
            <div key={k.id} className="flex items-center gap-2 py-2 border-b border-[var(--border-card)]">
              <span className="w-3 h-3 rounded-full" style={{ background: k.color }} />
              <span className="text-sm text-[var(--text-secondary)] flex-1">{k.label}</span>
              {k.tracksMood && <span className="text-[10px] text-[var(--text-muted)]">{t('dash.journal.tracks_mood')}</span>}
              {k.builtin ? (
                <span className="text-[10px] text-[var(--text-muted)] opacity-60">{t('dash.journal.builtin')}</span>
              ) : (
                <button onClick={() => post({ type: 'journal_delete_kind', id: k.id })} className="text-[var(--text-muted)] hover:text-red-400 bg-transparent border-none cursor-pointer" title={t('dash.journal.delete')}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Add form */}
        <div className="px-5 py-4 border-t border-[var(--border-card)]">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
            placeholder={t('dash.journal.kind_name')}
            className="w-full px-3 py-2 text-sm rounded-lg outline-none mb-2"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-card)', color: 'var(--text-primary, #e5e5e5)' }}
          />
          <div className="flex items-center gap-1.5 mb-3 flex-wrap">
            {KIND_COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)} className="w-6 h-6 rounded-full border-2 cursor-pointer transition" style={{ background: c, borderColor: color === c ? '#fff' : 'transparent' }} />
            ))}
          </div>
          <label className="flex items-center gap-2 mb-3 text-xs text-[var(--text-muted)] cursor-pointer">
            <input type="checkbox" checked={tracksMood} onChange={(e) => setTracksMood(e.target.checked)} />
            {t('dash.journal.tracks_mood_hint')}
          </label>
          <button onClick={add} disabled={!label.trim()} className="w-full px-4 py-2 rounded-lg text-xs font-semibold text-white border-none cursor-pointer transition disabled:opacity-40" style={{ background: '#A855F7' }}>
            + {t('dash.journal.add_kind')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Entry Viewer ──────────────────────────────────────────────────────────────

function EntryViewer({ entry, kind, confirmDelete, onClose, onEdit, onAskDelete, onConfirmDelete, onCancelDelete }: {
  entry: DashboardJournalMonthEntry;
  kind: DashboardJournalKind;
  confirmDelete: boolean;
  onClose: () => void;
  onEdit: () => void;
  onAskDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-xl mx-4 rounded-2xl border bg-[var(--bg-card)] shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: '82vh', borderColor: `${kind.color}33` }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium inline-flex items-center gap-1.5" style={{ background: `${kind.color}22`, color: kind.color }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: kind.color }} />{kind.label}
            </span>
            <span className="text-[11px] text-[var(--text-muted)]">{entry.date}</span>
            {entry.author === 'ava' && <span className="text-[11px]" style={{ color: '#A855F7' }}>{t('dash.journal.ava_label')}</span>}
            {entry.mood && <span className="text-[11px] px-2 py-0.5 rounded-full text-white" style={{ background: MOOD_COLORS[entry.mood] }}>{t(MOOD_LABEL_KEYS[entry.mood])}</span>}
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white/50 hover:text-white hover:bg-white/10 border-none cursor-pointer transition">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="flex-1 px-5 pb-3 overflow-y-auto min-h-0">
          {entry.title && <h2 className="text-lg font-semibold text-[var(--text-primary,#e5e5e5)] mb-2">{entry.title}</h2>}
          <div className="text-sm leading-relaxed text-[var(--text-secondary)]"><MarkdownRenderer content={entry.content} /></div>
          {entry.tags && entry.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-4">
              {entry.tags.map((tag) => <span key={tag} className="px-2 py-0.5 rounded-full text-[10px] bg-[var(--bg-input)] text-[var(--text-muted)]">#{tag}</span>)}
            </div>
          )}
        </div>
        <div className="flex gap-2 px-5 pb-5 pt-1">
          {entry.author === 'user' && <button onClick={onEdit} className="px-4 py-2 rounded-lg text-xs font-semibold text-white border-none cursor-pointer" style={{ background: '#A855F7' }}>{t('dash.journal.edit_entry')}</button>}
          {confirmDelete ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-red-400">{t('dash.journal.delete_confirm')}</span>
              <button onClick={onConfirmDelete} className="text-[11px] px-2 py-1 rounded bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 cursor-pointer">{t('dash.journal.yes')}</button>
              <button onClick={onCancelDelete} className="text-[11px] px-2 py-1 rounded bg-[var(--bg-input)] text-[var(--text-muted)] border border-[var(--border-card)] hover:text-white cursor-pointer">{t('dash.journal.no')}</button>
            </div>
          ) : (
            <button onClick={onAskDelete} className="px-4 py-2 rounded-lg text-xs text-[var(--text-muted)] bg-transparent border border-[var(--border-card)] cursor-pointer hover:text-red-400 transition">{t('dash.journal.delete')}</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Entry Composer / Editor ───────────────────────────────────────────────────

function EntryComposer({ draft, kinds, onChange, onSave, onCancel }: {
  draft: Draft;
  kinds: DashboardJournalKind[];
  onChange: (d: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const kind = kindOf(kinds, draft.kind);
  const [showCal, setShowCal] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onCancel}>
      <div className="relative w-full max-w-xl mx-4 rounded-2xl border border-[#A855F7]/20 bg-[var(--bg-card)] shadow-2xl flex flex-col" style={{ maxHeight: '85vh' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <p className="text-sm font-semibold text-white">{draft.id ? t('dash.journal.edit_entry') : t('dash.journal.write_entry')}</p>
          <div className="relative">
            <button
              onClick={() => setShowCal((s) => !s)}
              className="text-xs rounded-md px-2.5 py-1.5 bg-[var(--bg-input)] text-[var(--text-secondary)] border border-[var(--border-card)] cursor-pointer inline-flex items-center gap-1.5 hover:text-white transition"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
              {formatDate(draft.date)}
            </button>
            {showCal && (
              <div className="absolute right-0 mt-1 z-20">
                <MiniDatePicker value={draft.date} onChange={(iso) => { onChange({ ...draft, date: iso }); setShowCal(false); }} />
              </div>
            )}
          </div>
        </div>

        {/* Kind picker */}
        <div className="flex flex-wrap gap-1.5 px-5 pb-2">
          {kinds.map((k) => (
            <button key={k.id} onClick={() => onChange({ ...draft, kind: k.id, mood: k.tracksMood ? draft.mood : undefined })}
              className="px-2.5 py-1 rounded-full text-[11px] border cursor-pointer inline-flex items-center gap-1.5 transition"
              style={{ borderColor: draft.kind === k.id ? k.color : 'var(--border-card)', background: draft.kind === k.id ? `${k.color}22` : 'transparent', color: draft.kind === k.id ? k.color : 'var(--text-muted)' }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: k.color }} />{k.label}
            </button>
          ))}
        </div>

        {/* Mood (reflective kinds only) */}
        {kind.tracksMood && (
          <div className="flex items-center gap-1.5 px-5 pb-2">
            <span className="text-[10px] text-[var(--text-muted)] mr-2">{t('dash.journal.mood')}</span>
            {[1, 2, 3, 4, 5].map((m) => (
              <button key={m} onClick={() => onChange({ ...draft, mood: draft.mood === m ? undefined : m })}
                className="w-8 h-8 rounded-full border-none cursor-pointer text-xs font-bold transition"
                style={{ background: draft.mood === m ? MOOD_COLORS[m] : 'var(--bg-input)', color: draft.mood === m ? '#fff' : 'var(--text-muted)' }}
                title={t(MOOD_LABEL_KEYS[m])}>{m}</button>
            ))}
          </div>
        )}

        <div className="px-5 pb-2">
          <input
            value={draft.title}
            onChange={(e) => onChange({ ...draft, title: e.target.value })}
            placeholder={t('dash.journal.title_placeholder')}
            className="w-full px-3 py-2 text-sm rounded-lg outline-none mb-2"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-card)', color: 'var(--text-primary, #e5e5e5)' }}
          />
          <textarea
            value={draft.content}
            onChange={(e) => onChange({ ...draft, content: e.target.value })}
            placeholder={t('dash.journal.write')}
            className="w-full p-3 text-sm rounded-lg resize-none outline-none"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(168,85,247,0.15)', color: 'var(--text-primary, #e5e5e5)', height: '220px' }}
            autoFocus
          />
          <input
            value={draft.tags}
            onChange={(e) => onChange({ ...draft, tags: e.target.value })}
            placeholder={t('dash.journal.tags_placeholder')}
            className="w-full px-3 py-2 text-xs rounded-lg outline-none mt-2"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-card)', color: 'var(--text-secondary)' }}
          />
        </div>

        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onSave} disabled={!draft.content.trim()}
            className="flex-1 px-5 py-2.5 rounded-lg text-xs font-semibold text-white border-none cursor-pointer transition disabled:opacity-40"
            style={{ background: '#A855F7' }}>{t('dash.journal.save_entry')}</button>
          <button onClick={onCancel} className="px-5 py-2.5 rounded-lg text-xs text-[var(--text-secondary)] bg-transparent border border-[var(--border-card)] cursor-pointer hover:bg-[var(--bg-input)] transition">{t('dash.journal.cancel')}</button>
        </div>
      </div>
    </div>
  );
}

// ── Search results ────────────────────────────────────────────────────────────

function SearchResults({ hits, kinds, onClear, onJump }: {
  hits: DashboardJournalSearchHit[];
  kinds: DashboardJournalKind[];
  onClear: () => void;
  onJump: (iso: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-card)]">
        <span className="text-xs text-[var(--text-muted)]">{hits.length} {t('dash.journal.results')}</span>
        <button onClick={onClear} className="text-[11px] text-[var(--text-muted)] hover:text-white bg-transparent border-none cursor-pointer">{t('dash.journal.clear_search')}</button>
      </div>
      {hits.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)] p-6 text-center">{t('dash.journal.no_results')}</p>
      ) : (
        <ul className="divide-y divide-[var(--border-card)]">
          {hits.map((h) => {
            const k = kindOf(kinds, h.kind);
            return (
              <li key={h.entry_id}>
                <button onClick={() => onJump(h.date)} className="w-full text-left px-4 py-3 hover:bg-white/5 border-none bg-transparent cursor-pointer transition">
                  <span className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] text-[var(--text-muted)]">{h.date}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ background: `${k.color}22`, color: k.color }}>{k.label}</span>
                  </span>
                  {h.title && <span className="block text-sm font-medium text-[var(--text-primary,#e5e5e5)]">{h.title}</span>}
                  <span className="block text-xs text-[var(--text-muted)]">…{h.snippet}…</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyMonth({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center p-12 h-full">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="text-[var(--text-muted)] opacity-30 mb-3">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
      </svg>
      <p className="text-sm text-[var(--text-muted)] mb-4">{t('dash.journal.no_entries')}</p>
      <button onClick={onNew} className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white border-none cursor-pointer transition" style={{ background: '#A855F7' }}>
        + {t('dash.journal.write_entry')}
      </button>
    </div>
  );
}

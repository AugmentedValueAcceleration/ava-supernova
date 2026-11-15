// "What Ava knows" — the Memory page for memory v4 (mockup approved 15 Nov 2026).
//
// ONE SHARED FILE: identical in the extension and the IDE apart from the
// import line. Inline styles; each app passes its own plumbing in as
// `request(op, args)`, which runs core's memoryPage() on the host and
// resolves with its reply. Everything shown is read from the same files
// Ava reads, so the page and Ava can never disagree.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { tt, useLocale } from '../i18n';

// ── Shapes (mirror core's memory-v4/page.ts) ──────────────────────────────

type Kind = 'person' | 'preference' | 'rule' | 'project' | 'event';
interface PageFact {
  id: string; text: string; kind: Kind; scope: string; project: string | null;
  origin: 'said' | 'noticed' | 'memory'; quote?: string; from: string;
  history: Array<{ text: string; from: string; until?: string }>; wouldReplace?: string;
  /** A suggested promotion: the projects the lesson came up in. */
  seenIn?: string[];
}
interface Overview {
  facts: number; aboutYou: number; days: number; pending: number; threadsOpen: number;
  core: string; coreTokens: number; coreBudget: number; projects: Array<{ id: string; name: string; count: number; links: string[]; paths: string[] }>;
  allProjects: Array<{ id: string; name: string }>;
}
interface ThreadRow { id: string; text: string; project?: string; projectName: string | null; added: string; due?: string; done?: string }
interface Day { date: string; sections: Array<{ name: string; project?: string; lines: string[] }> }

export type MemoryRequest = (op: string, args?: Record<string, unknown>) => Promise<unknown>;

// ── Look ──────────────────────────────────────────────────────────────────

const C = {
  text: 'var(--text-primary, #cdd6f4)', text2: 'var(--text-secondary, #a6adc8)', muted: 'var(--text-muted, #6c7086)',
  border: 'var(--border-card, rgba(168,85,247,0.12))', strong: 'rgba(168,85,247,0.28)', accent: 'var(--accent, #a855f7)',
  soft: 'rgba(168,85,247,0.12)', card: 'var(--bg-card, rgba(26,16,40,0.6))', input: 'var(--bg-input, rgba(49,34,68,0.5))',
  ok: '#34d399', warn: '#fbbf24', danger: '#f87171',
};
const card: CSSProperties = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', margin: '10px 0' };
const btn: CSSProperties = { background: 'transparent', border: `1px solid ${C.border}`, color: C.text2, borderRadius: 8, padding: '4px 10px', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' };
const primary: CSSProperties = { ...btn, background: C.accent, borderColor: C.accent, color: '#fff' };
const pill = (on: boolean): CSSProperties => ({ ...btn, borderRadius: 999, padding: '6px 14px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8, background: on ? C.soft : 'transparent', borderColor: on ? C.strong : C.border, color: on ? C.text : C.text2 });
const badge: CSSProperties = { background: C.accent, color: '#fff', borderRadius: 999, fontSize: 11, padding: '0 7px', lineHeight: '18px', minWidth: 18, textAlign: 'center' };
const meta: CSSProperties = { color: C.muted, fontSize: 12, marginTop: 6, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' };
const h2: CSSProperties = { fontSize: 13, fontWeight: 500, color: C.text2, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '26px 0 6px' };
const textarea: CSSProperties = { width: '100%', background: C.input, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: '8px 10px', fontFamily: 'inherit', fontSize: 13.5, lineHeight: 1.55, resize: 'vertical', boxSizing: 'border-box' };
const sub: CSSProperties = { color: C.muted, fontSize: 13, margin: '0 0 12px' };

const KIND_LABEL = (k: Kind) => ({
  person: tt('memory.v4.kind.person', 'Who you are'),
  preference: tt('memory.v4.kind.preference', 'What you like'),
  rule: tt('memory.v4.kind.rule', 'How Ava works with you'),
  project: tt('memory.v4.kind.project', 'Project facts'),
  event: tt('memory.v4.kind.event', 'Things that happened'),
}[k]);
const KINDS: Kind[] = ['person', 'preference', 'rule', 'project', 'event'];

type Tab = 'yes' | 'you' | 'projects' | 'threads' | 'days';

function longDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** The core page as headings and bullets, not raw Markdown. */
function CoreView({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) out.push(<ul key={out.length} style={{ margin: '0 0 0 18px', padding: 0 }}>{bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>);
    bullets = [];
  };
  for (const line of text.split('\n')) {
    if (/^#{1,3}\s+/.test(line)) { flush(); out.push(<div key={out.length} style={{ color: C.text, fontWeight: 500, margin: '10px 0 4px' }}>{line.replace(/^#{1,3}\s+/, '')}</div>); }
    else if (/^[-*]\s+/.test(line)) bullets.push(line.replace(/^[-*]\s+/, ''));
    else if (line.trim()) { flush(); out.push(<div key={out.length}>{line}</div>); }
  }
  flush();
  return <div style={{ fontSize: 13.5, color: C.text2, marginTop: 10 }}>{out}</div>;
}

// ── One fact ──────────────────────────────────────────────────────────────

function FactCard({ fact, request, onChanged }: { fact: PageFact; request: MemoryRequest; onChanged: () => void }) {
  useLocale();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(fact.text);
  const [confirmForget, setConfirmForget] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async (op: string, args: Record<string, unknown>) => {
    setBusy(true);
    try { await request(op, args); onChanged(); } finally { setBusy(false); }
  };
  const pending = fact.origin === 'noticed';
  const chip: CSSProperties = {
    border: `1px solid ${fact.origin === 'said' ? 'rgba(52,211,153,0.35)' : pending ? 'rgba(251,191,36,0.35)' : C.border}`,
    color: fact.origin === 'said' ? C.ok : pending ? C.warn : C.text2, borderRadius: 999, padding: '0 8px', fontSize: 11.5,
  };
  const origin = fact.origin === 'said' ? tt('memory.v4.said', 'you said it') : pending ? tt('memory.v4.noticed', 'Ava noticed') : tt('memory.v4.from_memory', 'from your memory');
  return (
    <div style={{ ...card, borderColor: pending ? 'rgba(251,191,36,0.3)' : C.border, opacity: busy ? 0.6 : 1 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {fact.seenIn && fact.seenIn.length > 0 && (
            <div style={{ ...meta, margin: '0 0 6px', color: C.warn }}>
              {tt('memory.v4.seen_in', 'Came up in {projects}. Is this how you always work?').replace('{projects}', fact.seenIn.join(tt('memory.v4.and', ' and ')))}
            </div>
          )}
          {fact.wouldReplace && (
            <div style={{ ...meta, margin: '0 0 6px' }}>{tt('memory.v4.would_replace', 'Would replace:')} {fact.wouldReplace}</div>
          )}
          {editing ? (
            <textarea style={textarea} rows={Math.min(8, Math.max(2, Math.ceil(draft.length / 90)))} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
          ) : (
            <div style={{ color: C.text, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{fact.text}</div>
          )}
          <div style={meta}>
            <span style={chip}>{origin}</span>
            <span>{fact.project ?? tt('memory.v4.about_you_short', 'about you')}</span>
            {fact.from && <span>{tt('memory.v4.since', 'since {date}').replace('{date}', fact.from)}</span>}
          </div>
          {fact.quote && <div style={{ marginTop: 6, color: C.text2, fontSize: 13, borderLeft: `2px solid ${C.strong}`, paddingLeft: 10 }}>“{fact.quote}”</div>}
          {showHistory && fact.history.length > 0 && (
            <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(0,0,0,0.18)', borderRadius: 8, fontSize: 12.5, color: C.muted }}>
              {fact.history.map((h, i) => (
                <div key={i}><s>{h.text}</s> · {tt('memory.v4.true_from_to', 'true {from} → {until}').replace('{from}', h.from || '?').replace('{until}', h.until || '?')}</div>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {editing ? (
            <>
              <button type="button" style={primary} disabled={busy || !draft.trim()} onClick={() => { setEditing(false); void run('edit', { id: fact.id, text: draft }); }}>{tt('memory.v4.save', 'Save')}</button>
              <button type="button" style={btn} onClick={() => { setDraft(fact.text); setEditing(false); }}>{tt('memory.v4.cancel', 'Cancel')}</button>
            </>
          ) : confirmForget ? (
            <>
              <button type="button" style={{ ...btn, color: C.danger, borderColor: 'rgba(248,113,113,0.4)' }} onClick={() => void run(pending ? 'reject' : 'forget', { id: fact.id })}>{tt('memory.v4.forget_for_good', 'Forget for good')}</button>
              <button type="button" style={btn} onClick={() => setConfirmForget(false)}>{tt('memory.v4.cancel', 'Cancel')}</button>
            </>
          ) : pending ? (
            <>
              <button type="button" style={{ ...btn, color: C.ok, borderColor: 'rgba(52,211,153,0.4)' }} onClick={() => void run('confirm', { id: fact.id })}>{tt('memory.v4.yes', 'Yes, remember')}</button>
              <button type="button" style={btn} onClick={() => setEditing(true)}>{tt('memory.v4.edit', 'Edit')}</button>
              <button type="button" style={{ ...btn, color: C.danger }} onClick={() => void run('reject', { id: fact.id })}>{tt('memory.v4.no', 'No')}</button>
            </>
          ) : (
            <>
              {fact.history.length > 0 && (
                <button type="button" style={btn} onClick={() => setShowHistory((s) => !s)}>{tt('memory.v4.history', 'History ({n})').replace('{n}', String(fact.history.length))}</button>
              )}
              <button type="button" style={btn} onClick={() => setEditing(true)}>{tt('memory.v4.edit', 'Edit')}</button>
              <button type="button" style={{ ...btn, color: C.danger }} onClick={() => setConfirmForget(true)}>{tt('memory.v4.forget', 'Forget')}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── A list of facts (one tab), grouped by kind, paged ─────────────────────

function FactList({ view, project, query, request, refreshKey, onChanged }: {
  view: 'pending' | 'you' | 'project'; project?: string; query: string; request: MemoryRequest; refreshKey: number; onChanged: () => void;
}) {
  useLocale();
  const [items, setItems] = useState<PageFact[] | null>(null);
  const [total, setTotal] = useState(0);
  const [byKind, setByKind] = useState<Record<string, number>>({});
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let alive = true;
    setItems(null);
    void request('facts', { view, project, query }).then((r) => {
      if (!alive) return;
      const res = r as { items: PageFact[]; total: number; byKind: Record<string, number> };
      setItems(res.items); setTotal(res.total); setByKind(res.byKind ?? {});
    });
    return () => { alive = false; };
  }, [view, project, query, refreshKey, request]);

  const more = async () => {
    if (!items) return;
    setLoadingMore(true);
    try {
      const res = await request('facts', { view, project, query, offset: items.length }) as { items: PageFact[] };
      setItems([...items, ...res.items]);
    } finally { setLoadingMore(false); }
  };

  if (!items) return <div style={{ color: C.muted, padding: '20px 4px' }}>{tt('memory.v4.loading', 'Loading…')}</div>;
  if (!items.length) {
    return <div style={{ color: C.muted, padding: '20px 4px' }}>{query ? tt('memory.v4.no_match', 'Nothing matches.') : view === 'pending' ? tt('memory.v4.nothing_waiting', 'Nothing waiting. ✓') : tt('memory.v4.empty', 'Nothing here yet.')}</div>;
  }
  if (view === 'pending') return <>{items.map((f) => <FactCard key={f.id} fact={f} request={request} onChanged={onChanged} />)}</>;

  const groups: ReactNode[] = [];
  for (const k of KINDS) {
    const list = items.filter((f) => f.kind === k);
    if (!list.length) continue;
    groups.push(<div key={`h-${k}`} style={h2}>{KIND_LABEL(k)} <span style={{ color: C.muted, textTransform: 'none', letterSpacing: 0 }}>· {byKind[k] ?? list.length}</span></div>);
    for (const f of list) groups.push(<FactCard key={f.id} fact={f} request={request} onChanged={onChanged} />);
  }
  return (
    <>
      {groups}
      {items.length < total && (
        <div style={{ textAlign: 'center', margin: '16px 0' }}>
          <button type="button" style={btn} disabled={loadingMore} onClick={() => void more()}>
            {loadingMore ? tt('memory.v4.loading', 'Loading…') : tt('memory.v4.show_more', 'Show more ({n} left)').replace('{n}', String(total - items.length))}
          </button>
        </div>
      )}
    </>
  );
}

// ── Linked projects ───────────────────────────────────────────────────────

/** Projects that belong together share what's relevant, ranked a little below the open one's own facts. */
function LinkedProjects({ project, overview, onLink }: {
  project: string; overview: Overview; onLink: (other: string, link: boolean) => void;
}) {
  useLocale();
  const links = overview.projects.find((p) => p.id === project)?.links ?? [];
  const name = (id: string) => overview.allProjects.find((p) => p.id === id)?.name ?? id;
  const choices = overview.allProjects.filter((p) => p.id !== project && !links.includes(p.id));
  return (
    <div style={{ ...meta, margin: '2px 0 4px', gap: 8 }}>
      <span>{tt('memory.v4.linked_with', 'Linked with:')}</span>
      {links.length === 0 && <span>{tt('memory.v4.no_links', 'none')}</span>}
      {links.map((id) => (
        <span key={id} style={{ border: `1px solid ${C.border}`, borderRadius: 999, padding: '0 4px 0 10px', color: C.text2, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {name(id)}
          <button type="button" aria-label={tt('memory.v4.unlink', 'Unlink')} title={tt('memory.v4.unlink', 'Unlink')} onClick={() => onLink(id, false)}
            style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 4px' }}>×</button>
        </span>
      ))}
      {choices.length > 0 && (
        <select value="" aria-label={tt('memory.v4.link_with', 'Link with…')} onChange={(e) => { if (e.target.value) onLink(e.target.value, true); }}
          style={{ background: C.input, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text2, fontFamily: 'inherit', fontSize: 12, padding: '2px 6px' }}>
          <option value="">{tt('memory.v4.link_with', 'Link with…')}</option>
          {choices.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}
      <span style={{ color: C.muted }}>{tt('memory.v4.links_note', 'Linked projects share what is relevant to each other.')}</span>
    </div>
  );
}

// ── A project's folder, a move, and forgetting it ─────────────────────────

function ProjectTools({ project, onMove, onForget }: {
  project?: { id: string; name: string; count: number; paths: string[] };
  onMove: (path: string) => Promise<{ ok: boolean; error?: string }>;
  onForget: () => Promise<void>;
}) {
  useLocale();
  const [moving, setMoving] = useState(false);
  const [path, setPath] = useState('');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  if (!project) return null;
  const folder = project.paths[project.paths.length - 1];
  return (
    <div style={{ ...meta, margin: '0 0 6px', gap: 8 }}>
      <span>{folder ? tt('memory.v4.folder', 'Folder: {path}').replace('{path}', folder) : tt('memory.v4.no_folder', 'No folder yet')}</span>
      {moving ? (
        <>
          <input value={path} onChange={(e) => setPath(e.target.value)} placeholder={tt('memory.v4.move_placeholder', 'Paste the folder it moved to…')} autoFocus
            style={{ minWidth: 260, flex: 1, background: C.input, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: '3px 8px', fontFamily: 'inherit', fontSize: 12 }} />
          <button type="button" style={primary} disabled={!path.trim()} onClick={async () => {
            const r = await onMove(path.trim());
            if (r.ok) { setMoving(false); setPath(''); setError(''); } else setError(r.error ?? tt('memory.v4.move_failed', 'Could not move it.'));
          }}>{tt('memory.v4.save', 'Save')}</button>
          <button type="button" style={btn} onClick={() => { setMoving(false); setError(''); }}>{tt('memory.v4.cancel', 'Cancel')}</button>
          {error && <span style={{ color: C.warn }}>{error}</span>}
        </>
      ) : confirm ? (
        <>
          <span style={{ color: C.danger }}>
            {tt('memory.v4.forget_project_confirm', 'Forget all {n} facts and the threads of {name}? The days stay.').replace('{n}', String(project.count)).replace('{name}', project.name)}
          </span>
          <button type="button" style={{ ...btn, color: C.danger, borderColor: 'rgba(248,113,113,0.4)' }} onClick={() => void onForget()}>{tt('memory.v4.forget_for_good', 'Forget for good')}</button>
          <button type="button" style={btn} onClick={() => setConfirm(false)}>{tt('memory.v4.cancel', 'Cancel')}</button>
        </>
      ) : (
        <>
          <button type="button" style={btn} onClick={() => setMoving(true)}>{tt('memory.v4.moved', 'Moved this project')}</button>
          <button type="button" style={{ ...btn, color: C.danger }} onClick={() => setConfirm(true)}>{tt('memory.v4.forget_project', 'Forget this project')}</button>
        </>
      )}
    </div>
  );
}

// ── Forget everything ─────────────────────────────────────────────────────

function ForgetEverything({ total, onForget }: { total: number; onForget: () => Promise<void> }) {
  useLocale();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div style={{ ...meta, marginTop: 32, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
      {confirm ? (
        <>
          <span style={{ color: C.danger }}>
            {tt('memory.v4.forget_all_confirm', 'Forget everything Ava knows — all {n} facts, the core page, the threads and the days? This cannot be undone.').replace('{n}', String(total))}
          </span>
          <button type="button" disabled={busy} style={{ ...btn, color: C.danger, borderColor: 'rgba(248,113,113,0.4)' }}
            onClick={async () => { setBusy(true); try { await onForget(); } finally { setBusy(false); setConfirm(false); } }}>
            {tt('memory.v4.forget_for_good', 'Forget for good')}
          </button>
          <button type="button" style={btn} onClick={() => setConfirm(false)}>{tt('memory.v4.cancel', 'Cancel')}</button>
        </>
      ) : (
        <button type="button" style={{ ...btn, color: C.danger }} onClick={() => setConfirm(true)}>{tt('memory.v4.forget_all', 'Forget everything')}</button>
      )}
    </div>
  );
}

// ── The page ──────────────────────────────────────────────────────────────

export function MemoryV4Page({ request, onPendingChange }: {
  request: MemoryRequest;
  /** So the app can show the "waiting for your yes" badge in its sidebar. */
  onPendingChange?: (n: number) => void;
}) {
  useLocale();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);
  const [project, setProject] = useState<string | undefined>();
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [threads, setThreads] = useState<ThreadRow[] | null>(null);
  const [newThread, setNewThread] = useState('');
  const [days, setDays] = useState<Day[] | null>(null);
  const [daysTotal, setDaysTotal] = useState(0);
  const [editingCore, setEditingCore] = useState(false);
  const [coreDraft, setCoreDraft] = useState('');
  const [coreError, setCoreError] = useState('');
  const onPending = useRef(onPendingChange);
  onPending.current = onPendingChange;

  const loadOverview = useCallback(async () => {
    const o = await request('overview') as Overview;
    setOverview(o);
    onPending.current?.(o.pending);
    setTab((t) => t ?? (o.pending > 0 ? 'yes' : 'you'));
    setProject((p) => p ?? o.projects[0]?.id);
  }, [request]);

  useEffect(() => { void loadOverview(); }, [loadOverview, refreshKey]);

  // Search waits for a pause in typing.
  useEffect(() => {
    const t = setTimeout(() => setQuery(queryInput.trim()), 250);
    return () => clearTimeout(t);
  }, [queryInput]);

  useEffect(() => {
    if (tab === 'threads') void request('threads').then((r) => setThreads(r as ThreadRow[]));
    if (tab === 'days') void request('days', { query }).then((r) => { const res = r as { days: Day[]; total: number }; setDays(res.days); setDaysTotal(res.total); });
  }, [tab, query, refreshKey, request]);

  const changed = () => setRefreshKey((k) => k + 1);

  if (!overview || !tab) return <div style={{ color: C.muted, padding: 24 }}>{tt('memory.v4.loading', 'Loading…')}</div>;

  const openThreads = threads ? threads.filter((t) => !t.done).length : overview.threadsOpen;
  const tabs: Array<[Tab, string, number?]> = [
    ['yes', tt('memory.v4.tab.yes', 'Waiting for your yes'), overview.pending],
    ['you', tt('memory.v4.tab.you', 'About you')],
    ['projects', tt('memory.v4.tab.projects', 'Projects')],
    ['threads', tt('memory.v4.tab.threads', 'Open threads'), openThreads],
    ['days', tt('memory.v4.tab.days', 'Days')],
  ];

  return (
    <div style={{ color: C.text, fontSize: 14, lineHeight: 1.55, width: '100%' }}>
      <h1 style={{ fontSize: 20, fontWeight: 500, margin: '0 0 2px' }}>{tt('memory.v4.title', 'What Ava knows')}</h1>
      <p style={{ ...sub, marginBottom: 18 }}>
        {tt('memory.v4.summary', '{facts} facts · {you} about you · {projects} projects · {days} days remembered · everything on this computer')
          .replace('{facts}', String(overview.facts)).replace('{you}', String(overview.aboutYou))
          .replace('{projects}', String(overview.projects.length)).replace('{days}', String(overview.days))}
      </p>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="tablist">
          {tabs.map(([id, label, n]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} style={pill(tab === id)} onClick={() => setTab(id)}>
              {label}{n ? <span style={badge}>{n}</span> : null}
            </button>
          ))}
        </div>
        <input
          type="search" value={queryInput} onChange={(e) => setQueryInput(e.target.value)}
          placeholder={tt('memory.v4.search', 'Search everything Ava knows…')} aria-label={tt('memory.v4.search', 'Search everything Ava knows…')}
          style={{ flex: 1, minWidth: 180, background: C.input, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, padding: '8px 12px', fontFamily: 'inherit', fontSize: 13.5 }}
        />
      </div>

      {tab === 'yes' && (
        <>
          <p style={sub}>{tt('memory.v4.yes_intro', 'Things Ava noticed but you never said. They are not used until you say yes. She never asks you about these in a chat.')}</p>
          <FactList view="pending" query={query} request={request} refreshKey={refreshKey} onChanged={changed} />
        </>
      )}

      {tab === 'you' && (
        <>
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <span style={{ fontWeight: 500 }}>{tt('memory.v4.core', 'Core page')}</span>
                <span style={{ color: C.muted, fontSize: 12 }}> · {tt('memory.v4.core_note', 'read before every conversation, in every mode')}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: (editingCore ? Math.ceil(coreDraft.length / 4) : overview.coreTokens) > overview.coreBudget ? C.warn : C.muted }}>
                  {tt('memory.v4.core_budget', '~{n} of {max} tokens').replace('{n}', String(editingCore ? Math.ceil(coreDraft.length / 4) : overview.coreTokens)).replace('{max}', overview.coreBudget.toLocaleString())}
                </span>
                {editingCore ? (
                  <>
                    <button type="button" style={primary} onClick={async () => {
                      const r = await request('core', { text: coreDraft }) as { ok: boolean; error?: string };
                      if (r.ok) { setEditingCore(false); setCoreError(''); changed(); } else setCoreError(r.error ?? '');
                    }}>{tt('memory.v4.save', 'Save')}</button>
                    <button type="button" style={btn} onClick={() => { setEditingCore(false); setCoreError(''); }}>{tt('memory.v4.cancel', 'Cancel')}</button>
                  </>
                ) : (
                  <button type="button" style={btn} onClick={() => { setCoreDraft(overview.core); setEditingCore(true); }}>{tt('memory.v4.edit', 'Edit')}</button>
                )}
              </div>
            </div>
            {editingCore
              ? <textarea style={{ ...textarea, marginTop: 10, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 13 }} rows={18} value={coreDraft} onChange={(e) => setCoreDraft(e.target.value)} />
              : overview.core.trim() ? <CoreView text={overview.core} /> : <p style={{ ...sub, margin: '10px 0 0' }}>{tt('memory.v4.core_empty', 'Empty for now. It fills in as Ava gets to know you, or you can write it yourself.')}</p>}
            {coreError && <p style={{ color: C.warn, fontSize: 12.5, margin: '8px 0 0' }}>{coreError}</p>}
          </div>
          <FactList view="you" query={query} request={request} refreshKey={refreshKey} onChanged={changed} />
        </>
      )}

      {tab === 'projects' && (
        <>
          <p style={sub}>{tt('memory.v4.projects_intro', 'Facts that belong to one project. Ava only uses them when that project is open, or when you ask about it by name.')}</p>
          {overview.projects.length === 0 ? (
            <div style={{ color: C.muted, padding: '20px 4px' }}>{tt('memory.v4.no_projects', 'No project facts yet.')}</div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '4px 0 8px' }}>
                {overview.projects.map((p) => (
                  <button key={p.id} type="button" style={pill(project === p.id)} onClick={() => setProject(p.id)}>
                    {p.name}<span style={{ color: C.muted, fontSize: 12 }}>{p.count}</span>
                  </button>
                ))}
              </div>
              {project && (
                <LinkedProjects
                  project={project}
                  overview={overview}
                  onLink={async (other, link) => { await request(link ? 'link' : 'unlink', { a: project, b: other }); changed(); }}
                />
              )}
              {project && (
                <ProjectTools
                  key={`tools-${project}`}
                  project={overview.projects.find((p) => p.id === project)}
                  onMove={async (path) => { const r = await request('project_move', { project, path }) as { ok: boolean; error?: string }; if (r.ok) changed(); return r; }}
                  onForget={async () => { await request('project_forget', { project }); setProject(undefined); changed(); }}
                />
              )}
              {project && <FactList key={project} view="project" project={project} query={query} request={request} refreshKey={refreshKey} onChanged={changed} />}
            </>
          )}
        </>
      )}

      {tab === 'threads' && (
        <>
          <p style={sub}>{tt('memory.v4.threads_intro', 'Promises and loose ends Ava carries until they are done, in every project.')}</p>
          <div style={{ ...card, display: 'flex', gap: 8 }}>
            <input value={newThread} onChange={(e) => setNewThread(e.target.value)} placeholder={tt('memory.v4.thread_add_placeholder', 'Add something to come back to…')}
              onKeyDown={async (e) => { if (e.key === 'Enter' && newThread.trim()) { await request('thread_add', { text: newThread }); setNewThread(''); changed(); } }}
              style={{ flex: 1, background: C.input, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: '7px 10px', fontFamily: 'inherit', fontSize: 13.5 }} />
            <button type="button" style={primary} disabled={!newThread.trim()} onClick={async () => { await request('thread_add', { text: newThread }); setNewThread(''); changed(); }}>{tt('memory.v4.add', 'Add')}</button>
          </div>
          {!threads ? <div style={{ color: C.muted, padding: '20px 4px' }}>{tt('memory.v4.loading', 'Loading…')}</div>
            : threads.length === 0 ? <div style={{ color: C.muted, padding: '20px 4px' }}>{tt('memory.v4.no_threads', 'Nothing open.')}</div>
            : [...threads].sort((a, b) => Number(!!a.done) - Number(!!b.done)).map((t) => (
              <div key={t.id} style={card}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', opacity: t.done ? 0.5 : 1 }}>
                  <input type="checkbox" checked={!!t.done} aria-label={tt('memory.v4.thread_done', 'Done')} style={{ accentColor: '#a855f7', width: 16, height: 16 }}
                    onChange={async () => { await request(t.done ? 'thread_reopen' : 'thread_done', { id: t.id }); changed(); }} />
                  <div style={{ flex: 1, textDecoration: t.done ? 'line-through' : 'none' }}>
                    {t.text}
                    <div style={meta}>
                      <span>{t.projectName ?? tt('memory.v4.everywhere', 'everywhere')}</span>
                      <span>{tt('memory.v4.added', 'added {date}').replace('{date}', t.added)}</span>
                      {t.due && <span style={{ border: '1px solid rgba(251,191,36,0.35)', color: C.warn, borderRadius: 999, padding: '0 8px', fontSize: 11.5 }}>{tt('memory.v4.due', 'due {date}').replace('{date}', t.due)}</span>}
                    </div>
                  </div>
                  <button type="button" style={{ ...btn, color: C.danger }} onClick={async () => { await request('thread_delete', { id: t.id }); changed(); }}>{tt('memory.v4.delete', 'Delete')}</button>
                </div>
              </div>
            ))}
        </>
      )}

      {tab === 'days' && (
        <>
          <p style={sub}>{tt('memory.v4.days_intro', 'What happened each day, written at the end of each session. Ask Ava "what did we do on…" for any of these.')}</p>
          {!days ? <div style={{ color: C.muted, padding: '20px 4px' }}>{tt('memory.v4.loading', 'Loading…')}</div>
            : days.length === 0 ? <div style={{ color: C.muted, padding: '20px 4px' }}>{query ? tt('memory.v4.no_match', 'Nothing matches.') : tt('memory.v4.no_days', 'No days yet. Each session adds one.')}</div>
            : (
              <>
                {days.map((d) => (
                  <div key={d.date} style={card}>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{longDate(d.date)}</div>
                    {d.sections.map((s, i) => (
                      <div key={i}>
                        <div style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>{s.project ? s.name : tt('memory.v4.everywhere_cap', 'Everywhere')}</div>
                        <ul style={{ margin: '4px 0 0 18px', padding: 0, color: C.text2 }}>{s.lines.map((l, j) => <li key={j}>{l}</li>)}</ul>
                      </div>
                    ))}
                  </div>
                ))}
                {days.length < daysTotal && !query && (
                  <div style={{ textAlign: 'center', margin: '16px 0' }}>
                    <button type="button" style={btn} onClick={async () => {
                      const r = await request('days', { offset: days.length }) as { days: Day[] };
                      setDays([...days, ...r.days]);
                    }}>{tt('memory.v4.older_days', 'Older days')}</button>
                  </div>
                )}
              </>
            )}
        </>
      )}

      <ForgetEverything total={overview.facts + overview.pending} onForget={async () => {
        await request('forget_all');
        setProject(undefined);
        setThreads(null);
        setDays(null);
        changed();
      }} />
    </div>
  );
}

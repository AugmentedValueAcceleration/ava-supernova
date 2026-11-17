// The Brainstorm room (plan 2026-11-17-brainstorm, Phase 3; mockup
// Decisions/brainstorm/brainstorm-room-mockup.html, approved 17 Nov 2026).
//
// ONE SHARED FILE: identical in the extension and the IDE apart from the
// import line. Inline styles; each app passes in its own plumbing — `request`
// runs core's brainstormPage() on the host — and its own room chat
// (`renderChat`), keyed by the brainstorm, so every brainstorm is its own
// conversation. What's shown is read from ~/.ava/brainstorm, so the room and
// Ava can never disagree; it refreshes while she saves.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { tt } from '../i18n';

// ── Shapes (mirror core's brainstorm/types.ts and page.ts) ────────────────

type Kind = 'project' | 'feature' | 'experience' | 'direction' | 'unsure';
type IdeaStatus = 'candidate' | 'chosen' | 'parked' | 'rejected';
interface Summary {
  id: string; kind: Kind; headline: string; ideaCount: number; openCount: number;
  stepsDone: number; stepsTotal: number; hasExperience: boolean; projectPath?: string; updatedAt: string;
}
interface Idea { id: string; title: string; summary: string; status: IdeaStatus; reason?: string }
interface Step { id: string; text: string; tier: 'small' | 'ambitious'; done: boolean }
interface Change { at: string; type: 'changed' | 'new-idea' | 'note'; text: string; from: 'brainstorm' | 'work' }
interface Brainstorm {
  id: string; kind: Kind; headline: string; ideas: Idea[]; notes: string[];
  plan?: { summary?: string; steps: Step[]; changes: Change[] };
  experience?: { words: string[]; notWords: string[]; principles: Array<{ title: string; do: string; dont: string }>; kitId?: string };
  projectPath?: string; startedAt: string; updatedAt: string;
}
interface Detail { brainstorm: Brainstorm; kit: { id: string; name: string; proposed: boolean } | null }
interface State { brainstorms: Summary[]; projects: Array<{ path: string; name: string }> }

export type BrainstormRequest = (op: string, args?: Record<string, unknown>) => Promise<unknown>;

// ── Look (the Connections page's palette) ─────────────────────────────────

const C = {
  text: 'var(--text-primary, #cdd6f4)', text2: 'var(--text-secondary, #a6adc8)', muted: 'var(--text-muted, #6c7086)',
  border: 'var(--border-card, rgba(168,85,247,0.12))', strong: 'rgba(168,85,247,0.3)', accent: 'var(--accent, #a855f7)',
  soft: 'rgba(168,85,247,0.12)', card: 'var(--bg-card, rgba(26,16,40,0.6))', input: 'var(--bg-input, rgba(49,34,68,0.5))',
  deep: 'rgba(0,0,0,0.22)', ok: '#34d399', warn: '#fbbf24', danger: '#f87171', blue: '#93c5fd', pink: '#f9a8d4',
};
const KIND_COLOR: Record<Kind, string> = { project: C.ok, feature: C.blue, experience: C.pink, direction: C.warn, unsure: C.muted };
const btn: CSSProperties = { background: 'transparent', border: `1px solid ${C.border}`, color: C.text2, borderRadius: 8, padding: '5px 11px', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' };
const primary: CSSProperties = { ...btn, background: C.accent, borderColor: C.accent, color: '#fff' };
const danger: CSSProperties = { ...btn, color: C.danger };
const card: CSSProperties = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 11, padding: '10px 12px', marginBottom: 8 };
const note: CSSProperties = { color: C.muted, fontSize: 12.5 };
const h3: CSSProperties = { fontWeight: 500, fontSize: 14.5, margin: '18px 0 6px', color: C.text };
const chip = (color: string): CSSProperties => ({ border: `1px solid ${color}`, color, borderRadius: 999, padding: '0 7px', fontSize: 11, fontWeight: 400, whiteSpace: 'nowrap' });

const kindLabel = (k: Kind) => ({
  project: tt('brainstorm.room.kind.project', 'Project'),
  feature: tt('brainstorm.room.kind.feature', 'Feature'),
  experience: tt('brainstorm.room.kind.experience', 'Experience'),
  direction: tt('brainstorm.room.kind.direction', 'Direction'),
  unsure: tt('brainstorm.room.kind.unsure', 'Not sure yet'),
})[k];
const folderName = (p?: string) => (p ? p.split(/[\\/]/).filter(Boolean).pop() ?? p : '');
const untitled = () => tt('brainstorm.room.untitled', 'New brainstorm');

type Filter = 'all' | 'project' | 'feature' | 'experience' | 'direction' | 'unassigned';
type Tab = 'ideas' | 'plan' | 'experience';
const SELECTED_KEY = 'ava-brainstorm-selected';

// ── Pieces ────────────────────────────────────────────────────────────────

function PlanList({ s, filter, selected, onSelect, onNew }: { s: State; filter: Filter; selected: string | null; onSelect: (id: string) => void; onNew: () => void }) {
  const shown = s.brainstorms.filter((b) => filter === 'all' ? true : filter === 'unassigned' ? !b.projectPath : b.kind === filter);
  return (
    <>
      <button style={{ ...primary, width: '100%', padding: 8, marginBottom: 12 }} onClick={onNew}>{tt('brainstorm.room.new', '+ New brainstorm')}</button>
      {shown.length === 0 && <div style={{ ...note, padding: '6px 4px' }}>{tt('brainstorm.room.none', 'Nothing here yet.')}</div>}
      {shown.map((b) => (
        <div key={b.id} role="button" tabIndex={0} onClick={() => onSelect(b.id)} onKeyDown={(e) => { if (e.key === 'Enter') onSelect(b.id); }}
          style={{ padding: '9px 10px', borderRadius: 10, cursor: 'pointer', marginBottom: 4, border: `1px solid ${b.id === selected ? C.strong : 'transparent'}`, background: b.id === selected ? C.soft : 'transparent' }}>
          <div style={{ fontSize: 13.5, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.headline || untitled()}</div>
          <div style={{ fontSize: 11.5, color: C.muted, display: 'flex', gap: 6, alignItems: 'center', marginTop: 3, flexWrap: 'wrap' }}>
            <span style={chip(KIND_COLOR[b.kind])}>{kindLabel(b.kind)}</span>
            <span>{b.projectPath ? `→ ${folderName(b.projectPath)}` : tt('brainstorm.room.not_assigned', 'not assigned')}</span>
          </div>
        </div>
      ))}
    </>
  );
}

const COLUMNS: Array<{ status: IdeaStatus; label: () => string }> = [
  { status: 'chosen', label: () => tt('brainstorm.room.col.chosen', 'Chosen') },
  { status: 'candidate', label: () => tt('brainstorm.room.col.candidate', 'Candidates') },
  { status: 'parked', label: () => tt('brainstorm.room.col.parked', 'Parked') },
  { status: 'rejected', label: () => tt('brainstorm.room.col.rejected', 'Rejected') },
];

function IdeasBoard({ b, onMove }: { b: Brainstorm; onMove: (ideaId: string, status: IdeaStatus) => void }) {
  if (!b.ideas.length) return <div style={note}>{tt('brainstorm.room.ideas_empty', 'Ideas appear here as you talk them through with me — including the ones you turn down, and why.')}</div>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))', gap: 12 }}>
      {COLUMNS.map((col) => {
        const ideas = b.ideas.filter((i) => i.status === col.status);
        return (
          <div key={col.status}>
            <div style={{ fontSize: 11.5, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text2, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
              <span>{col.label()}</span><span>{ideas.length}</span>
            </div>
            {ideas.map((i) => (
              <div key={i.id} style={{ ...card, ...(i.status === 'chosen' ? { borderColor: 'rgba(52,211,153,0.4)' } : {}), ...(i.status === 'rejected' ? { opacity: 0.78 } : {}) }}>
                <div style={{ fontWeight: 500, fontSize: 13.5, color: C.text }}>{i.title}</div>
                {i.summary && <div style={{ color: C.text2, fontSize: 12.5, marginTop: 4 }}>{i.summary}</div>}
                {i.reason && (i.status === 'rejected' || i.status === 'parked') && (
                  <div style={{ marginTop: 6, fontSize: 12, color: C.muted, borderLeft: `2px solid ${i.status === 'rejected' ? C.danger : C.warn}`, paddingLeft: 7 }}>“{i.reason}”</div>
                )}
                <select aria-label={tt('brainstorm.room.move', 'Move to')} value={i.status} onChange={(e) => onMove(i.id, e.target.value as IdeaStatus)}
                  style={{ marginTop: 8, background: C.input, color: C.text2, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11.5, padding: '2px 4px', fontFamily: 'inherit' }}>
                  {COLUMNS.map((c) => <option key={c.status} value={c.status}>{c.label()}</option>)}
                </select>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function PlanView({ b, onTick }: { b: Brainstorm; onTick: (stepId: string, done: boolean) => void }) {
  const p = b.plan;
  if (!p || (!p.summary && !p.steps.length)) return <div style={note}>{tt('brainstorm.room.plan_empty', 'When you choose an idea, its plan appears here: the small version first, then the ambitious one. It keeps growing as you build.')}</div>;
  const tier = (t: 'small' | 'ambitious') => p.steps.filter((s) => s.tier === t);
  const steps = (list: Step[]) => list.map((s) => (
    <label key={s.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '7px 0', borderBottom: `1px dashed ${C.border}`, fontSize: 13.5, cursor: 'pointer' }}>
      <input type="checkbox" checked={s.done} onChange={(e) => onTick(s.id, e.target.checked)} style={{ marginTop: 3 }} />
      <span style={{ color: s.done ? C.muted : C.text, textDecoration: s.done ? 'line-through' : 'none' }}>{s.text}</span>
    </label>
  ));
  return (
    <div style={{ maxWidth: 780 }}>
      {p.summary && <><div style={{ ...h3, marginTop: 0 }}>{tt('brainstorm.room.what_it_is', 'What it is')}</div><div style={{ color: C.text2, fontSize: 13.5 }}>{p.summary}</div></>}
      {tier('small').length > 0 && <><div style={h3}>{tt('brainstorm.room.small', 'The small version first')}</div>{steps(tier('small'))}</>}
      {tier('ambitious').length > 0 && <><div style={h3}>{tt('brainstorm.room.ambitious', 'The ambitious version')}</div>{steps(tier('ambitious'))}</>}
      {p.changes.length > 0 && (
        <>
          <div style={h3}>{tt('brainstorm.room.how_it_grew', 'How it has grown')}</div>
          {[...p.changes].reverse().map((c, i) => (
            <div key={i} style={{ background: C.soft, borderLeft: `2px solid ${C.accent}`, borderRadius: 6, padding: '8px 12px', fontSize: 13, color: C.text2, margin: '6px 0' }}>
              <b style={{ color: C.text, fontWeight: 500 }}>
                {c.type === 'changed' ? tt('brainstorm.room.changed', 'Changed') : c.type === 'new-idea' ? tt('brainstorm.room.new_idea', 'New idea') : tt('brainstorm.room.note', 'Note')}
                {c.from === 'work' ? ` · ${tt('brainstorm.room.while_building', 'while building')}` : ''} · {c.at.slice(0, 10)}:
              </b>{' '}{c.text}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function ExperienceView({ d, onOpenKit }: { d: Detail; onOpenKit?: (kitId: string) => void }) {
  const e = d.brainstorm.experience;
  if (!e || (!e.words.length && !e.principles.length)) return <div style={note}>{tt('brainstorm.room.exp_empty', 'Tell me how the people using it should feel — calm, playful, safe, powerful — and I’ll pin it down with you here.')}</div>;
  const word = (w: string, not: boolean) => (
    <span key={w} style={{ border: `1px solid ${not ? 'rgba(108,112,134,0.5)' : 'rgba(249,168,212,0.35)'}`, color: not ? C.muted : C.pink, textDecoration: not ? 'line-through' : 'none', borderRadius: 999, padding: '2px 11px', fontSize: 13 }}>{w}</span>
  );
  return (
    <div style={{ maxWidth: 780 }}>
      <div style={note}>{tt('brainstorm.room.exp_words', 'What the people using it should feel')}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0 4px' }}>{e.words.map((w) => word(w, false))}{e.notWords.map((w) => word(w, true))}</div>
      {e.principles.map((p, i) => (
        <div key={i} style={{ ...card, margin: '8px 0', padding: '12px 14px' }}>
          <b style={{ fontWeight: 500, color: C.text }}>{i + 1}. {p.title}</b>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8, fontSize: 12.5 }}>
            <div style={{ borderRadius: 8, padding: '7px 10px', background: C.deep, borderLeft: `2px solid ${C.ok}`, color: C.text2 }}>{p.do}</div>
            <div style={{ borderRadius: 8, padding: '7px 10px', background: C.deep, borderLeft: `2px solid ${C.danger}`, color: C.text2 }}>{p.dont}</div>
          </div>
        </div>
      ))}
      <div style={{ marginTop: 14, border: `1px solid ${C.strong}`, background: C.soft, borderRadius: 11, padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', fontSize: 13, color: C.text2 }}>
        <span>
          {d.kit
            ? (d.kit.proposed
              ? tt('brainstorm.room.kit_proposed', 'In the proposed brand kit “{name}” — agree it in Brand Kits in the Creative Studio and every mode uses it.').replace('{name}', d.kit.name)
              : tt('brainstorm.room.kit_saved', 'Saved in the brand kit “{name}” — every mode designs and writes from it.').replace('{name}', d.kit.name))
            : tt('brainstorm.room.kit_none', 'Not in a brand kit yet. Ask me to save it to your brand kit, so every mode uses it.')}
        </span>
        {d.kit && onOpenKit && <button style={btn} onClick={() => onOpenKit(d.kit!.id)}>{tt('brainstorm.room.open_kit', 'Open the kit')}</button>}
      </div>
    </div>
  );
}

function AssignPanel({ s, b, onAssign, onClose }: { s: State; b: Brainstorm; onAssign: (path: string) => void; onClose: () => void }) {
  const row: CSSProperties = { padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 9, marginTop: 6, cursor: 'pointer', fontSize: 13.5, display: 'flex', justifyContent: 'space-between', color: C.text, background: 'transparent', width: '100%', fontFamily: 'inherit', textAlign: 'left' };
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(5,3,10,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 110, zIndex: 50 }}>
      <div role="dialog" aria-label={tt('brainstorm.room.assign_title', 'Assign to a project')} style={{ width: 'min(440px, 92vw)', background: '#1a1028', border: `1px solid ${C.strong}`, borderRadius: 14, padding: 18, maxHeight: '70vh', overflow: 'auto' }}>
        <div style={{ fontWeight: 500, fontSize: 16, color: C.text }}>{tt('brainstorm.room.assign_title', 'Assign to a project')}</div>
        <div style={{ ...note, marginTop: 4 }}>{tt('brainstorm.room.assign_hint', 'The plan stays here in Brainstorm. I see it whenever you work in that project, and keep it up to date as you build.')}</div>
        {s.projects.length === 0 && <div style={{ ...note, marginTop: 10 }}>{tt('brainstorm.room.no_projects', 'No projects yet. When you start one, you can assign this to it.')}</div>}
        {s.projects.map((p) => (
          <button key={p.path} style={row} onClick={() => onAssign(p.path)}>
            {p.name}
            {b.projectPath === p.path && <span style={{ color: C.ok, fontSize: 12 }}>{tt('brainstorm.room.assigned', 'assigned')}</span>}
          </button>
        ))}
        {b.projectPath && <button style={{ ...row, color: C.text2 }} onClick={() => onAssign('')}>{tt('brainstorm.room.unassign', 'Not assigned to a project')}</button>}
        <div style={{ marginTop: 12 }}><button style={btn} onClick={onClose}>{tt('brainstorm.room.cancel', 'Cancel')}</button></div>
      </div>
    </div>
  );
}

// ── The room ──────────────────────────────────────────────────────────────

export function BrainstormRoom({ request, renderChat, onWorkOnThis, onOpenKit, primer, onPrimerUsed }: {
  request: BrainstormRequest;
  /** The app's room chat for one brainstorm. `seed` is a first message to send once (a hand-off from the main chat). */
  renderChat: (brainstormId: string, seed: string | null) => ReactNode;
  /** "Work on this": the app opens its main chat in Code mode with this plan. */
  onWorkOnThis: (b: { id: string; headline: string; projectPath?: string }) => void;
  onOpenKit?: (kitId: string) => void;
  /** Hand-off from the main chat: start a new brainstorm and send this as its first message. */
  primer?: string | null;
  onPrimerUsed?: () => void;
}) {
  const [st, setSt] = useState<State | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [selected, setSelected] = useState<string | null>(() => { try { return localStorage.getItem(SELECTED_KEY); } catch { return null; } });
  const [seed, setSeed] = useState<{ id: string; text: string } | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [tab, setTab] = useState<Tab>('ideas');
  const [assigning, setAssigning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const alive = useRef(true);

  const select = useCallback((id: string | null) => {
    setSelected(id);
    setDeleting(false);
    try { if (id) localStorage.setItem(SELECTED_KEY, id); else localStorage.removeItem(SELECTED_KEY); } catch { /* storage unavailable */ }
  }, []);

  const load = useCallback(async (id: string | null) => {
    try {
      const s = await request('state') as State;
      if (!alive.current) return;
      setSt(s); setFailed(null);
      const keep = id && s.brainstorms.some((b) => b.id === id) ? id : (s.brainstorms[0]?.id ?? null);
      if (keep !== id) select(keep);
      setDetail(keep ? await request('read', { id: keep }) as Detail | null : null);
    } catch (e) {
      if (alive.current) setFailed(e instanceof Error ? e.message : String(e));
    }
  }, [request, select]);

  // Ava saves while you talk: keep up with her.
  useEffect(() => {
    alive.current = true;
    void load(selected);
    const timer = setInterval(() => void load(selected), 2500);
    return () => { alive.current = false; clearInterval(timer); };
  }, [load, selected]);

  const createNew = useCallback(async (first?: string) => {
    const r = await request('create') as { id: string; state: State };
    setSt(r.state);
    select(r.id);
    setTab('ideas');
    if (first) setSeed({ id: r.id, text: first });
  }, [request, select]);

  // A hand-off from the main chat starts its own brainstorm, once.
  const primerUsed = useRef(false);
  useEffect(() => {
    if (!primer || primerUsed.current) return;
    primerUsed.current = true;
    void createNew(primer).then(() => onPrimerUsed?.());
  }, [primer, createNew, onPrimerUsed]);

  const act = async (op: string, args: Record<string, unknown>) => {
    const r = await request(op, args) as { detail?: Detail; state?: State } & Partial<State>;
    if (r.state) setSt(r.state);
    if (r.detail !== undefined) setDetail(r.detail);
  };

  const filters: Array<{ id: Filter; label: string }> = [
    { id: 'all', label: tt('brainstorm.room.filter.all', 'All') },
    { id: 'project', label: tt('brainstorm.room.filter.projects', 'Projects') },
    { id: 'feature', label: tt('brainstorm.room.filter.features', 'Features') },
    { id: 'experience', label: tt('brainstorm.room.filter.experiences', 'Experiences') },
    { id: 'direction', label: tt('brainstorm.room.filter.directions', 'Directions') },
    { id: 'unassigned', label: tt('brainstorm.room.filter.unassigned', 'Unassigned') },
  ];
  const b = detail?.brainstorm ?? null;
  const steps = b?.plan?.steps ?? [];
  const tabStyle = (on: boolean): CSSProperties => ({ padding: '8px 14px', cursor: 'pointer', color: on ? C.text : C.text2, fontSize: 13.5, background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderBottom: `2px solid ${on ? C.accent : 'transparent'}`, fontFamily: 'inherit' });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '250px minmax(0,1fr) minmax(320px,380px)', height: '100%', minHeight: 0, color: C.text }}>
      {/* Left: every brainstorm lives here */}
      <aside style={{ borderRight: `1px solid ${C.border}`, padding: '16px 12px', overflow: 'auto', background: 'rgba(0,0,0,0.15)' }}>
        <div style={{ fontWeight: 500, fontSize: 16, padding: '2px 6px 12px', display: 'flex', gap: 8, alignItems: 'center' }}><span aria-hidden>💡</span>{tt('brainstorm.room.title', 'Brainstorm')}</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', margin: '0 2px 10px' }}>
          {filters.map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              style={{ fontSize: 11.5, padding: '2px 8px', borderRadius: 999, border: `1px solid ${filter === f.id ? C.accent : C.border}`, background: filter === f.id ? C.soft : 'transparent', color: filter === f.id ? C.text : C.text2, cursor: 'pointer', fontFamily: 'inherit' }}>{f.label}</button>
          ))}
        </div>
        {st && <PlanList s={st} filter={filter} selected={selected} onSelect={(id) => { select(id); setTab('ideas'); }} onNew={() => void createNew()} />}
        {!st && <div style={note}>{failed ? tt('brainstorm.room.failed', "Your brainstorms couldn't be read: {error}").replace('{error}', failed) : tt('brainstorm.room.loading', 'Reading your brainstorms…')}</div>}
      </aside>

      {/* Centre: the brainstorm you're looking at */}
      <main style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
        {!b ? (
          <div style={{ margin: 'auto', textAlign: 'center', maxWidth: 440, padding: 24 }}>
            <div style={{ fontSize: 20, fontWeight: 500 }}>{tt('brainstorm.room.empty_title', 'Bring me part of an idea')}</div>
            <div style={{ ...note, fontSize: 13.5, margin: '8px 0 16px' }}>{tt('brainstorm.room.empty_body', 'A project, a feature, how it should feel for the people using it, or where a project goes next. We’ll work it through together, and everything we decide is kept here.')}</div>
            <button style={primary} onClick={() => void createNew()}>{tt('brainstorm.room.new', '+ New brainstorm')}</button>
          </div>
        ) : (
          <>
            <div style={{ padding: '16px 22px 0' }}>
              <div style={{ fontSize: 20, fontWeight: 500, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                {b.headline || untitled()} <span style={chip(KIND_COLOR[b.kind])}>{kindLabel(b.kind)}</span>
                {steps.length > 0 && <span style={{ fontSize: 12, color: C.ok }}>{tt('brainstorm.room.progress', '{done} of {total} steps done').replace('{done}', String(steps.filter((s) => s.done).length)).replace('{total}', String(steps.length))}</span>}
              </div>
              <div style={{ color: C.text2, fontSize: 13, marginTop: 4 }}>
                {b.projectPath
                  ? tt('brainstorm.room.assigned_to', 'Assigned to {project}').replace('{project}', folderName(b.projectPath))
                  : tt('brainstorm.room.not_assigned_long', 'Not assigned to a project yet')}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <button style={primary} onClick={() => onWorkOnThis({ id: b.id, headline: b.headline || untitled(), projectPath: b.projectPath })}>{tt('brainstorm.room.work_on_this', 'Work on this')}</button>
                <button style={btn} onClick={() => setAssigning(true)}>{tt('brainstorm.room.assign', 'Assign to project')}</button>
                {deleting ? (
                  <>
                    <span style={{ fontSize: 12.5, color: C.text2 }}>{tt('brainstorm.room.delete_confirm', 'Delete this brainstorm and its plan?')}</span>
                    <button style={danger} onClick={() => { void act('delete', { id: b.id }).then(() => { select(null); setDetail(null); }); }}>{tt('brainstorm.room.delete', 'Delete')}</button>
                    <button style={btn} onClick={() => setDeleting(false)}>{tt('brainstorm.room.cancel', 'Cancel')}</button>
                  </>
                ) : <button style={danger} onClick={() => setDeleting(true)}>{tt('brainstorm.room.delete', 'Delete')}</button>}
              </div>
              <div style={{ display: 'flex', gap: 2, marginTop: 14, borderBottom: `1px solid ${C.border}` }}>
                <button style={tabStyle(tab === 'ideas')} onClick={() => setTab('ideas')}>{tt('brainstorm.room.tab.ideas', 'Ideas')}{b.ideas.length ? ` · ${b.ideas.length}` : ''}</button>
                <button style={tabStyle(tab === 'plan')} onClick={() => setTab('plan')}>{tt('brainstorm.room.tab.plan', 'Plan')}</button>
                <button style={tabStyle(tab === 'experience')} onClick={() => setTab('experience')}>{tt('brainstorm.room.tab.experience', 'Experience')}</button>
              </div>
            </div>
            <section style={{ padding: '18px 22px', overflow: 'auto', flex: 1, minHeight: 0 }}>
              {tab === 'ideas' && <IdeasBoard b={b} onMove={(ideaId, status) => void act('idea', { id: b.id, ideaId, status })} />}
              {tab === 'plan' && <PlanView b={b} onTick={(step, done) => void act('tick', { id: b.id, step, done })} />}
              {tab === 'experience' && detail && <ExperienceView d={detail} onOpenKit={onOpenKit} />}
            </section>
          </>
        )}
      </main>

      {/* Right: Ava, in the room — one conversation per brainstorm */}
      <aside style={{ borderLeft: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'rgba(0,0,0,0.18)' }}>
        {selected
          ? renderChat(selected, seed && seed.id === selected ? seed.text : null)
          : <div style={{ ...note, margin: 'auto', padding: 20, textAlign: 'center' }}>{tt('brainstorm.room.chat_empty', 'Start a brainstorm and I’ll be here.')}</div>}
      </aside>

      {assigning && st && b && (
        <AssignPanel s={st} b={b} onClose={() => setAssigning(false)} onAssign={(path) => { setAssigning(false); void act('assign', { id: b.id, project: path }); }} />
      )}
    </div>
  );
}

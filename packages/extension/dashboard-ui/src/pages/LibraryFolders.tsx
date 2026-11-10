import { useEffect, useMemo, useRef, useState, type ReactNode, type DragEvent } from 'react';
import { createPortal } from 'react-dom';
import { tt } from '../i18n';
import { post } from '../App';
import type { LibraryFolderInfo, PlanItemStateInfo } from '../types/messages';

/**
 * Library folders (Library folders and packs plan, Phase 1, 9 Nov 2026).
 *
 * A folder is a NAME holding pointers to work — files never move, one piece can
 * sit in several folders, and deleting a folder never deletes work. The store
 * is core's library-folders.ts (folders.json), shared with the IDE; this file
 * is only the face of it. Every change goes to the host and comes back as the
 * whole list, so what is shown is always what is saved.
 *
 * Mirrored in the IDE (DashboardPages.tsx, LibraryFolders section).
 */

export type FolderRef = string; // creative:<id> | logo:<group> | file:<absolute path>

/** Dragging work or a folder: what is being carried. */
export const DRAG_WORK = 'application/x-ava-library-ref';
export const DRAG_FOLDER = 'application/x-ava-library-folder';

/** A project file's reference. Same spelling on every surface, so one file is one member. */
export function fileRef(absolutePath: string): FolderRef {
  const p = absolutePath.replace(/\\/g, '/');
  return `file:${/^[a-z]:\//.test(p) ? p[0].toUpperCase() + p.slice(1) : p}`;
}

export function childrenOf(folders: LibraryFolderInfo[], parentId: string | null): LibraryFolderInfo[] {
  return folders.filter((f) => f.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

function pathTo(folders: LibraryFolderInfo[], id: string | null): LibraryFolderInfo[] {
  const out: LibraryFolderInfo[] = [];
  for (let cur = id; cur; ) {
    const f = folders.find((x) => x.id === cur);
    if (!f || out.includes(f)) break;
    out.unshift(f);
    cur = f.parentId;
  }
  return out;
}

// ── Pack plans ───────────────────────────────────────────────────────────────

export type PlanStates = Record<string, Record<string, PlanItemStateInfo>>;

/** "7 of 16 made · 2 in progress · next: Arched window". Mirrors core's planProgressLine. */
export function planProgress(folder: LibraryFolderInfo, states: Record<string, PlanItemStateInfo> = {}): { made: number; total: number; line: string } {
  const items = folder.plan?.items ?? [];
  const made = items.filter((i) => states[i.id] === 'made').length;
  const going = items.filter((i) => states[i.id] === 'in_progress' || states[i.id] === 'started').length;
  const next = items.find((i) => (states[i.id] ?? 'planned') === 'planned');
  const line = `${made} of ${items.length} made${going ? ` · ${going} in progress` : ''}${next ? ` · next: ${next.name}` : made === items.length && items.length ? ' · every piece is made' : ''}`;
  return { made, total: items.length, line };
}

/** The plan and piece a piece of work is making, if any. */
export function planFor(folders: LibraryFolderInfo[], creativeId?: string | null) {
  if (!creativeId) return null;
  for (const f of folders) {
    const item = f.plan?.items.find((i) => i.work && (i.work.tool === 'gimp' ? `gimp_${i.work.slug}` : `model_${i.work.slug}`) === creativeId);
    if (item) return { folder: f, item };
  }
  return null;
}

export function PlanGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3" />
    </svg>
  );
}

/**
 * What Ava is told when the piece on the stage is in a folder (Phase 3): the
 * folder, how much is in it, its style note, and to look at the set before a
 * brief — so piece 40 matches piece 1. Empty when it is in no folder.
 */
export function folderContextLine(folders: LibraryFolderInfo[], creativeId?: string | null, plans: PlanStates = {}): string {
  if (!creativeId) return '';
  const planned = planFor(folders, creativeId);
  const planBit = planned
    ? ` · WORKING FROM THE PACK PLAN "${planned.folder.plan!.title}": this is "${planned.item.name}" — ${planned.item.what} (${planProgress(planned.folder, plans[planned.folder.id]).line}). Build the brief on that plan line`
    : '';
  const ref = `creative:${creativeId}`;
  const homes = folders.filter((f) => f.members.some((m) => m.ref === ref));
  if (!homes.length) return planBit;
  const parts = homes.map((f) => {
    const path = pathTo(folders, f.id).map((x) => x.name).join(' / ');
    const others = f.members.length - 1;
    return `"${path}" (${others} other piece${others === 1 ? '' : 's'}${f.note ? `; THEIR STYLE NOTE: "${f.note}"` : '; no style note yet'})`;
  });
  return ` · IN FOLDER ${parts.join(' and ')} — look at the set with design_folder (action look) before you propose a brief, and hold what it shares${planBit}`;
}

/** Every folder, kept in step with the host. */
export function useLibraryFolders() {
  const [folders, setFolders] = useState<LibraryFolderInfo[]>([]);
  const [missing, setMissing] = useState<Record<string, string[]>>({});
  const [plans, setPlans] = useState<PlanStates>({});
  const [error, setError] = useState<string | null>(null);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const m = e.data as { type?: string; folders?: LibraryFolderInfo[]; missing?: Record<string, string[]>; plans?: PlanStates; error?: string; results?: Array<{ name: string; ok: boolean; error?: string }> };
      if (m?.type === 'library_folders') {
        setFolders(m.folders ?? []);
        setMissing(m.missing ?? {});
        setPlans(m.plans ?? {});
        setError(m.error ?? null);
      }
      if (m?.type === 'library_upload_result' && m.results) {
        const failed = m.results.filter((r) => !r.ok);
        const added = m.results.length - failed.length;
        setUploadNote([
          added ? tt('library.folders.uploaded', '{n} added to the Library.').replace('{n}', String(added)) : '',
          ...failed.map((r) => `${r.name}: ${r.error ?? tt('library.folders.upload_failed', 'not added')}`),
        ].filter(Boolean).join(' '));
      }
    };
    window.addEventListener('message', onMessage);
    post({ type: 'folders_load' } as never);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  return { folders, missing, plans, error, clearError: () => setError(null), uploadNote, clearUploadNote: () => setUploadNote(null) };
}

const send = (msg: Record<string, unknown>) => post(msg as never);

/** Read what is being dropped. */
function dropped(e: DragEvent): { ref?: FolderRef; folder?: string } {
  const ref = e.dataTransfer.getData(DRAG_WORK);
  const folder = e.dataTransfer.getData(DRAG_FOLDER);
  return { ref: ref || undefined, folder: folder || undefined };
}

// ── The folder button on every card ──────────────────────────────────────────

/** Where the menu goes: under its button, kept on screen. Fixed to the window,
 *  so no card or grid can clip it (a card clips anything that spills out). */
function menuSpot(anchor: HTMLElement | null, width = 240, height = 300): { left: number; top: number } {
  const r = anchor?.getBoundingClientRect();
  if (!r) return { left: 16, top: 16 };
  const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
  const below = r.bottom + 4;
  const top = below + height > window.innerHeight - 8 ? Math.max(8, r.top - height - 4) : below;
  return { left, top };
}

/** "Add to folder" for one piece of work: tick the folders it should be in. */
export function FolderMenu({ folders, itemRef, anchor, onClose }: { folders: LibraryFolderInfo[]; itemRef: FolderRef; anchor: HTMLElement | null; onClose: () => void }) {
  const [name, setName] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const [spot] = useState(() => menuSpot(anchor));
  useEffect(() => {
    // Its own button toggles it, so a press there is not "away".
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (box.current?.contains(t) || anchor?.contains(t)) return;
      onClose();
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    // The page moving under a fixed menu would leave it floating off its card.
    const moved = () => onClose();
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    window.addEventListener('resize', moved);
    window.addEventListener('scroll', moved, true);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('resize', moved);
      window.removeEventListener('scroll', moved, true);
    };
  }, [onClose, anchor]);

  const rows: Array<{ f: LibraryFolderInfo; depth: number }> = [];
  const walk = (parent: string | null, depth: number) => {
    for (const f of childrenOf(folders, parent)) { rows.push({ f, depth }); walk(f.id, depth + 1); }
  };
  walk(null, 0);

  const make = () => {
    const n = name.trim();
    if (!n) return;
    send({ type: 'folder_create', name: n, parentId: null, add: [{ ref: itemRef }] });
    setName('');
  };

  return createPortal(
    <div
      ref={box}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      draggable={false}
      onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
      className="fixed z-[1000] w-60 rounded-lg border border-[var(--accent)]/35 p-2 shadow-2xl"
      // Solid: the page colour under the card tint, so nothing shows through.
      style={{ left: spot.left, top: spot.top, background: 'linear-gradient(var(--bg-card), var(--bg-card)), var(--bg-page)' }}
    >
      <p className="px-1 pb-1.5 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{tt('library.folders.add_to', 'In folders')}</p>
      <div className="max-h-56 overflow-y-auto">
        {rows.length === 0 && (
          <p className="px-1 py-2 text-[11px] text-[var(--text-secondary)]">{tt('library.folders.none_yet', 'No folders yet. Name one below.')}</p>
        )}
        {rows.map(({ f, depth }) => {
          const inIt = f.members.some((m) => m.ref === itemRef);
          return (
            <label
              key={f.id}
              className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-[11px] text-[var(--text-primary)] hover:bg-[var(--accent)]/10"
              style={{ paddingLeft: 4 + depth * 12 }}
            >
              <input
                type="checkbox"
                checked={inIt}
                onChange={() => send(inIt
                  ? { type: 'folder_remove', id: f.id, refs: [itemRef] }
                  : { type: 'folder_add', id: f.id, items: [{ ref: itemRef }] })}
                className="h-3 w-3 accent-[var(--accent)]"
              />
              <span className="truncate">{f.name}</span>
            </label>
          );
        })}
      </div>
      <div className="mt-2 flex gap-1 border-t border-[var(--border)] pt-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') make(); }}
          placeholder={tt('library.folders.new_placeholder', 'New folder')}
          className="min-w-0 flex-1 rounded border border-[var(--border)] bg-transparent px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
        />
        <button
          onClick={make}
          disabled={!name.trim()}
          className="rounded bg-[var(--accent)]/15 px-2 text-[11px] font-medium text-[var(--accent)] disabled:opacity-40"
        >
          {tt('library.folders.create', 'Add')}
        </button>
      </div>
    </div>,
    document.body,
  );
}

/** "In folders" for the piece on a room's stage: which folders it is in, and a menu to change that. */
export function FolderPicker({ folders, itemRef }: { folders: LibraryFolderInfo[]; itemRef: FolderRef }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const homes = folders.filter((f) => f.members.some((m) => m.ref === itemRef));
  return (
    <>
      <button
        ref={btn}
        onClick={() => setOpen((o) => !o)}
        title={tt('library.folders.add_to_folder', 'Add to a folder')}
        className={`flex max-w-[260px] items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition ${
          homes.length ? 'border-[var(--accent)]/40 text-[var(--accent)]' : 'border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
        }`}
      >
        <FolderGlyph size={12} />
        <span className="truncate">{homes.length ? homes.map((f) => f.name).join(', ') : tt('library.folders.add_to_folder', 'Add to a folder')}</span>
      </button>
      {open && <FolderMenu folders={folders} itemRef={itemRef} anchor={btn.current} onClose={() => setOpen(false)} />}
    </>
  );
}

/** The plan's chip in a room: which plan, which piece, how far along. */
export function PlanChip({ folders, plans, creativeId }: { folders: LibraryFolderInfo[]; plans: PlanStates; creativeId?: string | null }) {
  const p = planFor(folders, creativeId);
  if (!p) return null;
  const prog = planProgress(p.folder, plans[p.folder.id]);
  return (
    <span title={p.item.what} className="flex max-w-[320px] items-center gap-1.5 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-2.5 py-1 text-[11px] text-[var(--text-primary)]">
      <span className="text-[var(--accent)]"><PlanGlyph size={12} /></span>
      <span className="truncate">{p.folder.plan!.title} · {p.item.name} · {prog.made}/{prog.total}</span>
    </span>
  );
}

const STATE_LOOK: Record<PlanItemStateInfo, { label: string; dot: string }> = {
  planned: { label: 'Planned', dot: 'bg-[var(--text-muted)]/40' },
  started: { label: 'Started', dot: 'bg-amber-400/70' },
  in_progress: { label: 'In progress', dot: 'bg-amber-400' },
  made: { label: 'Made', dot: 'bg-emerald-400' },
};

/** The pack plan, opened from its pinned tile: theirs to agree, edit, add to and trim. */
function PlanView({ folder, states, onClose }: { folder: LibraryFolderInfo; states: Record<string, PlanItemStateInfo>; onClose: () => void }) {
  const plan = folder.plan!;
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: '', what: '', tool: 'gimp', folder: '' });
  const [adding, setAdding] = useState(false);
  const [why, setWhy] = useState(plan.status !== 'agreed');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const prog = planProgress(folder, states);
  const groups = new Map<string, typeof plan.items>();
  for (const i of plan.items) { const k = i.folder ?? ''; groups.set(k, [...(groups.get(k) ?? []), i]); }
  const saveEdit = (itemId: string | null) => {
    if (!draft.name.trim()) return;
    send({ type: 'plan_item', id: folder.id, itemId, fields: { name: draft.name, what: draft.what, tool: draft.tool, folder: draft.folder } });
    setEditing(null); setAdding(false);
  };
  const editor = (itemId: string | null) => (
    <div className="flex flex-wrap items-center gap-1.5 py-1.5">
      <input autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={tt('library.plan.piece_name', 'Piece')} className="w-36 rounded border border-[var(--accent)] bg-transparent px-2 py-1 text-[12px] text-[var(--text-primary)] outline-none" />
      <input value={draft.what} onChange={(e) => setDraft({ ...draft, what: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(itemId); }} placeholder={tt('library.plan.piece_what', 'What it is, in one line')} className="min-w-[180px] flex-1 rounded border border-[var(--border)] bg-transparent px-2 py-1 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
      <select value={draft.tool} onChange={(e) => setDraft({ ...draft, tool: e.target.value })} className="rounded border border-[var(--border)] bg-[var(--bg-page)] px-1.5 py-1 text-[12px] text-[var(--text-primary)]">
        <option value="gimp">GIMP</option><option value="blender">Blender</option><option value="other">{tt('library.plan.other', 'Other')}</option>
      </select>
      <input value={draft.folder} onChange={(e) => setDraft({ ...draft, folder: e.target.value })} placeholder={tt('library.plan.piece_folder', 'Folder (optional)')} className="w-32 rounded border border-[var(--border)] bg-transparent px-2 py-1 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
      <button onClick={() => saveEdit(itemId)} className="rounded bg-[var(--accent)]/20 px-2 py-1 text-[11px] font-medium text-[var(--accent)]">{tt('common.save', 'Save')}</button>
      <button onClick={() => { setEditing(null); setAdding(false); }} className="px-1 text-[11px] text-[var(--text-muted)]">{tt('common.cancel', 'Cancel')}</button>
    </div>
  );

  return (
    <div className="mb-4 rounded-xl border border-[var(--accent)]/30 p-3" style={{ background: 'linear-gradient(var(--bg-card), var(--bg-card)), var(--bg-page)' }}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[13px] font-medium text-[var(--text-primary)]">
            <span className="text-[var(--accent)]"><PlanGlyph size={15} /></span>{plan.title}
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-normal ${plan.status === 'agreed' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-200'}`}>
              {plan.status === 'agreed' ? tt('library.plan.agreed', 'Agreed') : tt('library.plan.waiting', 'Waiting for you to agree it')}
            </span>
          </p>
          <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{prog.line}</p>
        </div>
        {plan.status !== 'agreed' && (
          <button onClick={() => send({ type: 'plan_agree', id: folder.id })} className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white">
            {tt('library.plan.agree', 'Agree the plan')}
          </button>
        )}
        <button onClick={onClose} className="text-[var(--text-muted)]" aria-label="Close">✕</button>
      </div>
      {plan.status !== 'agreed' && (
        <p className="mt-2 text-[11px] text-[var(--text-muted)]">{tt('library.plan.agree_note', 'Agreeing makes the folders inside this pack. Every piece still gets its own brief, one at a time.')}</p>
      )}

      <button onClick={() => setWhy((w) => !w)} className="mt-2 text-[11px] text-[var(--accent)] hover:underline">
        {why ? tt('library.plan.hide_why', 'Hide Ava\'s reasoning') : tt('library.plan.show_why', 'Ava\'s reasoning')}
      </button>
      {why && <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-[var(--text-secondary)]">{plan.reasoning}</p>}

      <div className="mt-3 space-y-3">
        {[...groups.entries()].map(([group, items]) => (
          <div key={group}>
            <p className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
              {group ? <><FolderGlyph size={11} />{group}</> : tt('library.plan.in_pack', 'In the pack')}
            </p>
            {items.map((i) => {
              const st = states[i.id] ?? 'planned';
              if (editing === i.id) return <div key={i.id}>{editor(i.id)}</div>;
              return (
                <div key={i.id} className="group/row flex items-start gap-2 rounded-md px-1 py-1 hover:bg-[var(--accent)]/5">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${STATE_LOOK[st].dot}`} title={STATE_LOOK[st].label} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] text-[var(--text-primary)]">
                      {i.name} <span className="text-[10px] text-[var(--text-muted)]">· {i.tool === 'gimp' ? 'GIMP' : i.tool === 'blender' ? 'Blender' : tt('library.plan.other', 'Other')} · {tt(`library.plan.state.${st}`, STATE_LOOK[st].label)}{i.work ? ` · "${i.work.name}"` : ''}</span>
                    </p>
                    <p className="text-[11px] text-[var(--text-secondary)]">{i.what}</p>
                  </div>
                  <span className="hidden shrink-0 gap-1 group-hover/row:flex">
                    <button onClick={() => { setDraft({ name: i.name, what: i.what, tool: i.tool, folder: i.folder ?? '' }); setEditing(i.id); setAdding(false); }} className="px-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]" title={tt('library.plan.edit', 'Change')}>✎</button>
                    <button onClick={() => send({ type: 'plan_item', id: folder.id, itemId: i.id, fields: null })} className="px-1 text-[11px] text-[var(--text-muted)] hover:text-red-300" title={tt('library.plan.remove', 'Take out of the plan')}>✕</button>
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-2">
        {adding ? editor(null) : (
          <button onClick={() => { setDraft({ name: '', what: '', tool: 'gimp', folder: '' }); setAdding(true); setEditing(null); }} className="text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            + {tt('library.plan.add', 'Add a piece')}
          </button>
        )}
        {!adding && (confirmDelete ? (
          <span className="ml-auto flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
            {tt('library.plan.delete_confirm', 'Delete the plan? The work and folders stay.')}
            <button onClick={() => { send({ type: 'plan_delete', id: folder.id }); onClose(); }} className="rounded bg-red-500/20 px-2 py-0.5 text-red-300">{tt('library.plan.delete_yes', 'Delete plan')}</button>
            <button onClick={() => setConfirmDelete(false)} className="text-[var(--text-muted)]">{tt('common.cancel', 'Cancel')}</button>
          </span>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="ml-auto text-[11px] text-[var(--text-muted)] hover:text-red-300">{tt('library.plan.delete', 'Delete plan')}</button>
        ))}
      </div>
    </div>
  );
}

/** The open folder's style note: one line, theirs, read by Ava before every brief. */
function StyleNote({ folder }: { folder: LibraryFolderInfo }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(folder.note ?? '');
  useEffect(() => { if (!editing) setText(folder.note ?? ''); }, [folder.note, editing]);
  const save = () => { if (text.trim() !== (folder.note ?? '')) send({ type: 'folder_note', id: folder.id, note: text }); setEditing(false); };
  return (
    <div className="mb-3 flex items-start gap-2 text-[11px]">
      <span className="shrink-0 pt-0.5 uppercase tracking-wider text-[var(--text-muted)]">{tt('library.folders.style_note', 'Style note')}</span>
      {editing ? (
        <input
          autoFocus
          value={text}
          maxLength={400}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setText(folder.note ?? ''); setEditing(false); } }}
          onBlur={save}
          placeholder={tt('library.folders.style_note_placeholder', 'How everything in here looks, e.g. flat, two colours, 2px dark outline, 64px grid')}
          className="min-w-0 flex-1 rounded border border-[var(--accent)] bg-transparent px-2 py-1 text-[12px] text-[var(--text-primary)] outline-none"
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          title={tt('library.folders.style_note_title', 'Ava follows this in every brief for work in this folder')}
          className={`min-w-0 flex-1 truncate text-left text-[12px] ${folder.note ? 'text-[var(--text-primary)]' : 'italic text-[var(--text-muted)]'} hover:text-[var(--accent)]`}
        >
          {folder.note ?? tt('library.folders.style_note_none', 'None yet. Add one line on how everything in here looks.')} <span className="not-italic opacity-60">✎</span>
        </button>
      )}
    </div>
  );
}

/** The small folder button that sits on a card, top left. */
export function FolderButton({ folders, itemRef }: { folders: LibraryFolderInfo[]; itemRef: FolderRef }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const count = folders.filter((f) => f.members.some((m) => m.ref === itemRef)).length;
  return (
    <>
      <button
        ref={btn}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        title={count ? tt('library.folders.in_n', 'In {n} folder(s)').replace('{n}', String(count)) : tt('library.folders.add_to_folder', 'Add to a folder')}
        className={`absolute left-1.5 top-1.5 z-20 flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] transition ${
          count || open
            ? 'bg-[var(--accent)]/85 text-white'
            : 'bg-black/55 text-white/85 opacity-0 group-hover:opacity-100 focus:opacity-100'
        }`}
      >
        <FolderGlyph size={12} />
        {count ? <span>{count}</span> : null}
      </button>
      {open && <FolderMenu folders={folders} itemRef={itemRef} anchor={btn.current} onClose={() => setOpen(false)} />}
    </>
  );
}

export function FolderGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

// ── While dragging work, from any tab: drop it on a folder ───────────────────

export function FolderDropBar({ folders, onDone }: { folders: LibraryFolderInfo[]; onDone: () => void }) {
  const [over, setOver] = useState<string | null>(null);
  const rows: Array<{ f: LibraryFolderInfo; label: string }> = [];
  const walk = (parent: string | null, prefix: string) => {
    for (const f of childrenOf(folders, parent)) { rows.push({ f, label: prefix + f.name }); walk(f.id, `${prefix}${f.name} / `); }
  };
  walk(null, '');
  return (
    <div className="sticky top-0 z-30 mb-3 rounded-lg border border-dashed border-[var(--accent)]/60 bg-[var(--bg-card)]/95 p-2 shadow-lg backdrop-blur">
      <p className="mb-1.5 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
        {rows.length ? tt('library.folders.drop_here', 'Drop on a folder') : tt('library.folders.drop_none', 'No folders yet. Make one in Folders.')}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {rows.map(({ f, label }) => (
          <div
            key={f.id}
            onDragOver={(e) => { if (e.dataTransfer.types.includes(DRAG_WORK)) { e.preventDefault(); setOver(f.id); } }}
            onDragLeave={() => setOver((o) => (o === f.id ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              const { ref } = dropped(e);
              if (ref) send({ type: 'folder_add', id: f.id, items: [{ ref }] });
              setOver(null);
              onDone();
            }}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] transition ${
              over === f.id ? 'border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--accent)]' : 'border-[var(--border)] text-[var(--text-secondary)]'
            }`}
          >
            <FolderGlyph size={12} />{label}
          </div>
        ))}
      </div>
    </div>
  );
}


// ── Download a folder (Phase 2) ──────────────────────────────────────────────

interface StoreInfo { id: string; name: string; status: 'ready' | 'blocked' | 'target'; summary: string; note: string }
interface ExportSummary { name: string; items: number; models: number; warnings: Array<{ item: string; message: string }>; blender: boolean }
interface ExportOutcome { ok?: boolean; cancelled?: boolean; path?: string; files?: number; bytes?: number; warnings?: Array<{ item: string; message: string }>; error?: string }

const sizeLabel = (b = 0) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : b < 1024 ** 3 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${(b / 1024 ** 3).toFixed(2)} GB`);

/** What a download will hold, then where it goes: a real folder, or a zip. */
function DownloadPanel({ folderId, onClose }: { folderId: string; onClose: () => void }) {
  const [summary, setSummary] = useState<ExportSummary | null | undefined>(undefined);
  const [zip, setZip] = useState(false);
  // The making record goes in by default (plan, Phase 4): it is what a store's AI disclosure is written from.
  const [record, setRecord] = useState(true);
  // Prepared for a store (Phase 5): '' is a plain download.
  const [stores, setStores] = useState<StoreInfo[]>([]);
  const [store, setStore] = useState('');
  const chosen = stores.find((s) => s.id === store);
  const zipOnly = store === 'gumroad';
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [result, setResult] = useState<ExportOutcome | null>(null);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const m = e.data as { type?: string; id?: string } & Record<string, unknown>;
      if (m?.id !== folderId) return;
      if (m.type === 'folder_export_preview') { setSummary((m.summary as ExportSummary | null) ?? null); setStores((m.stores as StoreInfo[]) ?? []); }
      if (m.type === 'folder_export_progress') setProgress({ done: Number(m.done), total: Number(m.total), label: String(m.label ?? '') });
      if (m.type === 'folder_export_result') { setProgress(null); setResult(m.cancelled ? null : (m as ExportOutcome)); }
    };
    window.addEventListener('message', onMessage);
    send({ type: 'folder_export_preview', id: folderId });
    return () => window.removeEventListener('message', onMessage);
  }, [folderId]);

  const busy = !!progress;
  const start = () => { setResult(null); setProgress({ done: 0, total: 1, label: tt('library.export.choosing', 'Choose where…') }); send({ type: 'folder_export', id: folderId, zip: zip || zipOnly, record, store: store || undefined }); };
  const warningList = (list: Array<{ item: string; message: string }>) => (
    <ul className="mt-2 space-y-1">
      {list.map((w, i) => <li key={i} className="text-[11px] text-amber-200/90"><span className="font-medium">{w.item}:</span> {w.message}</li>)}
    </ul>
  );

  return (
    <div className="mb-4 rounded-xl border border-[var(--accent)]/30 p-3" style={{ background: 'linear-gradient(var(--bg-card), var(--bg-card)), var(--bg-page)' }}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-[var(--text-primary)]">{tt('library.export.title', 'Download as a folder')}</p>
          {summary === undefined && <p className="mt-1 text-[11px] text-[var(--text-muted)]">{tt('library.export.reading', 'Looking at what\'s in it…')}</p>}
          {summary && (
            <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
              {tt('library.export.summary', '{items} pieces, finished files only. Each model gets its own folder with .fbx, .blend, .glb and its textures.')
                .replace('{items}', String(summary.items))}
            </p>
          )}
          {summary?.warnings.length ? warningList(summary.warnings) : null}
        </div>
        <button onClick={onClose} className="text-[var(--text-muted)]" aria-label="Close">✕</button>
      </div>

      {!result && stores.length > 0 && (
        <div className="mt-3">
          <label className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-secondary)]">
            {tt('library.export.prepare_for', 'Prepare for')}
            <select
              value={store}
              onChange={(e) => setStore(e.target.value)}
              disabled={busy}
              className="rounded border border-[var(--border)] bg-[var(--bg-page)] px-2 py-1 text-[12px] text-[var(--text-primary)]"
            >
              <option value="">{tt('library.export.no_store', 'No store: just the folder')}</option>
              {stores.filter((s) => s.status !== 'blocked').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              {stores.filter((s) => s.status === 'blocked').map((s) => <option key={s.id} value={s.id} disabled>{s.name} — {tt('library.export.blocked', 'not available')}</option>)}
            </select>
          </label>
          {chosen && (
            <div className="mt-2 space-y-1 text-[11px]">
              <p className="text-[var(--text-secondary)]">{chosen.summary}</p>
              <p className="text-amber-200/90">{chosen.note}</p>
              <p className="text-[var(--text-muted)]">{tt('library.export.only_store', 'Prepared for {store}: only {store} decides whether it is accepted.').split('{store}').join(chosen.name)}</p>
              <p className="text-[var(--text-muted)]">
                {tt('library.export.yours', 'Declaring AI use is yours to do: Ava never does it for you. Read the store’s current rules before you submit. This is not legal advice.')}{' '}
                <button type="button" onClick={() => post({ type: 'open_url', url: 'https://avasupernova.com/guides/selling-what-you-make' })} className="cursor-pointer border-none bg-transparent p-0 text-[var(--accent)] hover:underline">{tt('library.export.guide', 'What each store allows')}</button>
              </p>
            </div>
          )}
          {!chosen && stores.some((s) => s.status === 'blocked') && (
            <p className="mt-2 text-[11px] text-[var(--text-muted)]">
              {tt('library.export.not_available', 'Not available')}: {stores.filter((s) => s.status === 'blocked').map((s) => `${s.name} (${s.note.split('.')[0].toLowerCase()})`).join('; ')}.
            </p>
          )}
        </div>
      )}

      {!result && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
            <input type="radio" checked={!zip && !zipOnly} onChange={() => setZip(false)} disabled={busy || zipOnly} className="accent-[var(--accent)]" />
            {tt('library.export.as_folder', 'A folder')}
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
            <input type="radio" checked={zip || zipOnly} onChange={() => setZip(true)} disabled={busy || zipOnly} className="accent-[var(--accent)]" />
            {tt('library.export.as_zip', 'A zip')}
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]" title={tt('library.export.record_title', 'How each piece was made — which AI did what, your direction, fonts and licences. What a store\'s AI disclosure is written from.')}>
            <input type="checkbox" checked={record} onChange={() => setRecord((r) => !r)} disabled={busy} className="h-3 w-3 accent-[var(--accent)]" />
            {tt('library.export.record', 'Include how it was made')}
          </label>
          <button
            onClick={start}
            disabled={busy || !summary}
            className="ml-auto rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
          >
            {busy ? tt('library.export.working', 'Downloading…') : tt('library.export.choose', 'Choose where, and download')}
          </button>
        </div>
      )}
      {progress && (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded bg-[var(--accent)]/15">
            <div className="h-full bg-[var(--accent)] transition-all" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} />
          </div>
          <p className="mt-1 truncate text-[10px] text-[var(--text-muted)]">{progress.label}</p>
        </div>
      )}
      {result && (
        <div className="mt-3 text-[11px]">
          {result.ok ? (
            <div className="flex flex-wrap items-center gap-2 text-[var(--text-primary)]">
              <span>{tt('library.export.done', 'Done: {files} files, {size}.').replace('{files}', String(result.files ?? 0)).replace('{size}', sizeLabel(result.bytes))}</span>
              <button onClick={() => send({ type: 'folder_export_reveal', path: result.path })} className="text-[var(--accent)] hover:underline">{tt('library.export.show', 'Show it')}</button>
              <button onClick={() => setResult(null)} className="text-[var(--text-muted)] hover:underline">{tt('library.export.again', 'Download again')}</button>
            </div>
          ) : (
            <p className="text-red-300">{result.error ?? tt('library.export.failed', 'The download failed.')}</p>
          )}
          {result.warnings?.length ? warningList(result.warnings) : null}
        </div>
      )}
    </div>
  );
}

// ── The folder sidebar, beside the work on every Assets tab ─────────────────
// His call, 9 Nov: folders down the side, collapsible, instead of tiles along
// the top. Always there to drop on, whichever tab is open; renaming, deleting
// and downloading stay in the Folders tab.

const SIDEBAR_KEY = 'ava-library-folder-sidebar';
const SIDEBAR_EVENT = 'ava-library-folder-sidebar';

/** Height from where this sits down to the bottom of the window, kept right as
 *  the page scrolls or the window resizes — so the sidebar always reaches the
 *  bottom and its collapse tab sits in the middle of what you can see. */
function useFillHeight(ref: { current: HTMLElement | null }): number {
  const [h, setH] = useState(400);
  useEffect(() => {
    const measure = () => {
      const top = ref.current?.getBoundingClientRect().top ?? 0;
      setH(Math.max(200, window.innerHeight - Math.max(top, 8) - 12));
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [ref]);
  return h;
}

/** Open or collapsed, remembered on this machine. */
export function useFolderSidebar(): [boolean, () => void] {
  const [open, setOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(SIDEBAR_KEY) !== 'closed'; } catch { return true; }
  });
  // The sidebar and the Folders tab's tree are one setting: fold one, both fold.
  useEffect(() => {
    const sync = (e: Event) => setOpen((e as CustomEvent<boolean>).detail);
    window.addEventListener(SIDEBAR_EVENT, sync);
    return () => window.removeEventListener(SIDEBAR_EVENT, sync);
  }, []);
  const toggle = () => {
    const next = !open;
    try { localStorage.setItem(SIDEBAR_KEY, next ? 'open' : 'closed'); } catch { /* private window */ }
    window.dispatchEvent(new CustomEvent(SIDEBAR_EVENT, { detail: next }));
  };
  return [open, toggle];
}

/** The tab that folds the folder tree away or opens it: on its right edge, halfway down. */
function CollapseTab({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const label = open ? tt('library.folders.hide_sidebar', 'Hide folders') : tt('library.folders.show_sidebar', 'Show folders');
  return (
    <button
      onClick={onToggle}
      title={label}
      aria-label={label}
      className="absolute -right-3 top-1/2 z-10 flex h-10 w-5 -translate-y-1/2 items-center justify-center rounded-md border border-[var(--border)] text-[12px] text-[var(--text-muted)] transition hover:border-[var(--accent)]/60 hover:text-[var(--accent)]"
      style={{ background: 'linear-gradient(var(--bg-card), var(--bg-card)), var(--bg-page)' }}
    >
      {open ? '‹' : '›'}
    </button>
  );
}

/**
 * The folded-away tree: an icon for every folder, in tree order, so work can
 * still be dropped and folders opened or nested without unfolding (his ask,
 * 9 Nov). Hovering shows the name — drawn above the page, because the strip
 * scrolls and would clip it.
 */
function CollapsedStrip({ folders, height, boxRef, onOpenFolder, onToggle }: {
  folders: LibraryFolderInfo[];
  height: number;
  boxRef: { current: HTMLDivElement | null };
  onOpenFolder: (id: string) => void;
  onToggle: () => void;
}) {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const rows: Array<{ f: LibraryFolderInfo; depth: number; path: string }> = [];
  const walk = (parent: string | null, depth: number, prefix: string) => {
    for (const f of childrenOf(folders, parent)) { rows.push({ f, depth, path: prefix + f.name }); walk(f.id, depth + 1, `${prefix}${f.name} / `); }
  };
  walk(null, 0, '');
  const show = (e: { currentTarget: HTMLElement }, text: string) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ text, x: r.right + 8, y: r.top + r.height / 2 });
  };
  return (
    <div ref={boxRef} className="sticky top-2 flex w-9 shrink-0 flex-col self-start rounded-lg border border-[var(--border)]" style={{ height }}>
      <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto overflow-x-hidden py-2">
        {rows.map(({ f, depth, path }) => (
          <div
            key={f.id}
            draggable
            onDragStart={(e) => { e.dataTransfer.setData(DRAG_FOLDER, f.id); e.dataTransfer.effectAllowed = 'move'; setTip(null); }}
            onDragOver={(e) => { if (e.dataTransfer.types.includes(DRAG_WORK) || e.dataTransfer.types.includes(DRAG_FOLDER)) { e.preventDefault(); setDropOn(f.id); } }}
            onDragEnter={(e) => show(e, path)}
            onDragLeave={() => { setDropOn((d) => (d === f.id ? null : d)); setTip(null); }}
            onDrop={(e) => {
              e.preventDefault();
              setDropOn(null);
              setTip(null);
              const { ref, folder } = dropped(e);
              if (folder && folder !== f.id) send({ type: 'folder_move', id: folder, parentId: f.id });
              else if (ref) send({ type: 'folder_add', id: f.id, items: [{ ref }] });
            }}
            onClick={() => onOpenFolder(f.id)}
            onMouseEnter={(e) => show(e, path)}
            onMouseLeave={() => setTip(null)}
            aria-label={path}
            className={`flex shrink-0 cursor-pointer items-center justify-center rounded-md transition ${
              dropOn === f.id ? 'bg-[var(--accent)]/30 text-[var(--accent)] ring-1 ring-[var(--accent)]' : 'text-[var(--text-muted)] hover:bg-[var(--accent)]/15 hover:text-[var(--accent)]'
            }`}
            style={{ width: depth ? 22 : 26, height: depth ? 22 : 26, marginLeft: depth ? 6 : 0 }}
          >
            <FolderGlyph size={depth ? 12 : 15} />
          </div>
        ))}
      </div>
      <CollapseTab open={false} onToggle={onToggle} />
      {tip && createPortal(
        <div
          className="pointer-events-none fixed z-[1000] -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--accent)]/35 px-2 py-1 text-[11px] text-[var(--text-primary)] shadow-xl"
          style={{ left: tip.x, top: tip.y, background: 'linear-gradient(var(--bg-card), var(--bg-card)), var(--bg-page)' }}
        >
          {tip.text}
        </div>,
        document.body,
      )}
    </div>
  );
}

export function FolderSidebar({ folders, open, onToggle, onOpenFolder }: {
  folders: LibraryFolderInfo[];
  open: boolean;
  onToggle: () => void;
  onOpenFolder: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dropOn, setDropOn] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const [name, setName] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const height = useFillHeight(box);
  const countIn = (id: string): number => {
    const f = folders.find((x) => x.id === id);
    return (f?.members.length ?? 0) + childrenOf(folders, id).reduce((n, k) => n + countIn(k.id), 0);
  };
  const make = () => {
    const n = name.trim();
    if (n) send({ type: 'folder_create', name: n, parentId: null });
    setName('');
    setMaking(false);
  };

  const tab = <CollapseTab open={open} onToggle={onToggle} />;

  if (!open) {
    return <CollapsedStrip folders={folders} height={height} boxRef={box} onOpenFolder={onOpenFolder} onToggle={onToggle} />;
  }

  const node = (f: LibraryFolderInfo, depth: number): ReactNode => {
    const kids = childrenOf(folders, f.id);
    const isOpen = expanded.has(f.id);
    return (
      <div key={f.id}>
        <div
          draggable
          onDragStart={(e) => { e.dataTransfer.setData(DRAG_FOLDER, f.id); e.dataTransfer.effectAllowed = 'move'; }}
          onDragOver={(e) => { if (e.dataTransfer.types.includes(DRAG_WORK) || e.dataTransfer.types.includes(DRAG_FOLDER)) { e.preventDefault(); setDropOn(f.id); } }}
          onDragLeave={() => setDropOn((d) => (d === f.id ? null : d))}
          onDrop={(e) => {
            e.preventDefault();
            setDropOn(null);
            const { ref, folder } = dropped(e);
            if (folder && folder !== f.id) send({ type: 'folder_move', id: folder, parentId: f.id });
            else if (ref) send({ type: 'folder_add', id: f.id, items: [{ ref }] });
          }}
          onClick={() => onOpenFolder(f.id)}
          title={tt('library.folders.tile_title', 'Open, or drop work here')}
          className={`flex cursor-pointer items-center gap-1 rounded-md py-1 pr-1.5 text-[12px] transition ${
            dropOn === f.id ? 'bg-[var(--accent)]/25 text-[var(--accent)] ring-1 ring-[var(--accent)]' : 'text-[var(--text-secondary)] hover:bg-[var(--accent)]/10 hover:text-[var(--text-primary)]'
          }`}
          style={{ paddingLeft: 2 + depth * 12 }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded((s) => { const n = new Set(s); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); return n; }); }}
            className={`w-3.5 text-[9px] text-[var(--text-muted)] ${kids.length ? '' : 'invisible'}`}
            aria-label={isOpen ? 'Collapse' : 'Expand'}
          >
            {isOpen ? '▾' : '▸'}
          </button>
          <FolderGlyph size={13} />
          <span className="min-w-0 flex-1 truncate">{f.name}</span>
          <span className="text-[10px] text-[var(--text-muted)]">{countIn(f.id) || ''}</span>
        </div>
        {isOpen && kids.map((k) => node(k, depth + 1))}
      </div>
    );
  };

  return (
    <aside ref={box} className="sticky top-2 flex w-56 shrink-0 flex-col self-start rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-2" style={{ height }}>
      <div className="mb-1 px-1.5 py-1">
        <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{tt('library.folders.title', 'Folders')}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {childrenOf(folders, null).map((f) => node(f, 0))}
        {folders.length === 0 && (
          <p className="px-1.5 py-2 text-[11px] leading-relaxed text-[var(--text-secondary)]">
            {tt('library.folders.sidebar_empty', 'Make a folder, then drag work onto it. The work stays where it is; the folder points at it.')}
          </p>
        )}
      </div>
      <div className="mt-1 border-t border-[var(--border)] pt-1.5">
        {making ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') make(); if (e.key === 'Escape') { setMaking(false); setName(''); } }}
            onBlur={make}
            placeholder={tt('library.folders.new_placeholder', 'New folder')}
            className="w-full rounded border border-[var(--accent)] bg-transparent px-2 py-1 text-[12px] text-[var(--text-primary)] outline-none"
          />
        ) : (
          <button onClick={() => setMaking(true)} className="w-full rounded-md px-1.5 py-1 text-left text-[12px] text-[var(--text-muted)] hover:bg-[var(--accent)]/10 hover:text-[var(--text-primary)]">
            + {tt('library.folders.new', 'New folder')}
          </button>
        )}
      </div>
      {tab}
    </aside>
  );
}

// ── The Folders view ─────────────────────────────────────────────────────────

/** A part of a work that can be chosen on its own: a GIMP final, a logo form. */
export interface WorkPart { key: string; label: string }

export interface FolderItem {
  ref: FolderRef;
  title: string;
  card: ReactNode;
  parts?: WorkPart[];
}

export function FoldersView({
  folders, missing, error, onClearError, items, uploadNote, onClearUploadNote, initialOpenId = null, plans = {},
}: {
  folders: LibraryFolderInfo[];
  missing: Record<string, string[]>;
  error: string | null;
  onClearError: () => void;
  /** Every piece of work the Library can show, by reference. */
  items: Map<FolderRef, FolderItem>;
  uploadNote: string | null;
  onClearUploadNote: () => void;
  /** Open at this folder: a folder tile in All was clicked. */
  initialOpenId?: string | null;
  /** Each pack plan's pieces and how far along they are. */
  plans?: PlanStates;
}) {
  const [openId, setOpenId] = useState<string | null>(initialOpenId);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(pathTo(folders, initialOpenId).map((f) => f.id)));
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [making, setMaking] = useState(false);
  const [picking, setPicking] = useState<FolderRef | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  // The tree matches the sidebar on the other tabs: full height, scrolling,
  // the collapse tab halfway down — and folded or open together with it.
  const [treeOpen, toggleTree] = useFolderSidebar();
  const treeBox = useRef<HTMLDivElement>(null);
  const treeHeight = useFillHeight(treeBox);

  // The open folder went away (deleted here or in the IDE): back to the top.
  useEffect(() => { if (openId && !folders.some((f) => f.id === openId)) setOpenId(null); }, [folders, openId]);
  // A plan waiting for them opens by itself, so it is never missed.
  useEffect(() => { setPlanOpen(!!folders.find((f) => f.id === openId)?.plan && folders.find((f) => f.id === openId)?.plan?.status !== 'agreed'); }, [openId]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = openId ? folders.find((f) => f.id === openId) ?? null : null;
  const crumbs = useMemo(() => pathTo(folders, openId), [folders, openId]);
  const subfolders = childrenOf(folders, openId);
  const countIn = (id: string): number => {
    const f = folders.find((x) => x.id === id);
    return (f?.members.length ?? 0) + childrenOf(folders, id).reduce((n, k) => n + countIn(k.id), 0);
  };

  const openFolder = (id: string | null) => {
    setOpenId(id);
    setPicking(null);
    if (id) setExpanded((s) => { const n = new Set(s); for (const f of pathTo(folders, id)) n.add(f.id); return n; });
  };

  const makeFolder = () => {
    const n = newName.trim();
    if (!n) return;
    send({ type: 'folder_create', name: n, parentId: openId });
    setNewName('');
    setMaking(false);
    if (openId) setExpanded((s) => new Set(s).add(openId));
  };

  const dropTarget = (id: string | null) => ({
    onDragOver: (e: DragEvent) => {
      if (e.dataTransfer.types.includes(DRAG_WORK) || e.dataTransfer.types.includes(DRAG_FOLDER)) { e.preventDefault(); setDropOn(id ?? '__top'); }
    },
    onDragLeave: () => setDropOn((d) => (d === (id ?? '__top') ? null : d)),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setDropOn(null);
      const { ref, folder } = dropped(e);
      if (folder && folder !== id) send({ type: 'folder_move', id: folder, parentId: id });
      else if (ref && id) send({ type: 'folder_add', id, items: [{ ref }] });
    },
  });

  const treeNode = (f: LibraryFolderInfo, depth: number): ReactNode => {
    const kids = childrenOf(folders, f.id);
    const isOpen = expanded.has(f.id);
    return (
      <div key={f.id}>
        <div
          draggable={renaming !== f.id}
          onDragStart={(e) => { e.dataTransfer.setData(DRAG_FOLDER, f.id); e.dataTransfer.effectAllowed = 'move'; }}
          {...dropTarget(f.id)}
          onClick={() => openFolder(f.id)}
          className={`group/node flex cursor-pointer items-center gap-1 rounded-md py-1 pr-1 text-[12px] transition ${
            dropOn === f.id ? 'bg-[var(--accent)]/25 ring-1 ring-[var(--accent)]'
              : openId === f.id ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:bg-[var(--accent)]/8 hover:text-[var(--text-primary)]'
          }`}
          style={{ paddingLeft: 4 + depth * 14 }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded((s) => { const n = new Set(s); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); return n; }); }}
            className={`w-3.5 text-[9px] text-[var(--text-muted)] ${kids.length ? '' : 'invisible'}`}
            aria-label={isOpen ? 'Collapse' : 'Expand'}
          >
            {isOpen ? '▾' : '▸'}
          </button>
          <FolderGlyph size={13} />
          {renaming === f.id ? (
            <input
              autoFocus
              defaultValue={f.name}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { send({ type: 'folder_rename', id: f.id, name: (e.target as HTMLInputElement).value }); setRenaming(null); }
                if (e.key === 'Escape') setRenaming(null);
              }}
              onBlur={(e) => { if (e.target.value.trim() && e.target.value.trim() !== f.name) send({ type: 'folder_rename', id: f.id, name: e.target.value }); setRenaming(null); }}
              className="min-w-0 flex-1 rounded border border-[var(--accent)] bg-transparent px-1 text-[12px] text-[var(--text-primary)] outline-none"
            />
          ) : (
            <span className="min-w-0 flex-1 truncate">{f.name}</span>
          )}
          <span className="text-[10px] text-[var(--text-muted)] group-hover/node:hidden">{countIn(f.id) || ''}</span>
          <span className="hidden items-center gap-0.5 group-hover/node:flex">
            <IconBtn label={tt('library.folders.rename', 'Rename')} onClick={() => setRenaming(f.id)}>✎</IconBtn>
            <IconBtn label={tt('library.folders.delete', 'Delete folder')} onClick={() => setConfirmDelete(f.id)}>🗑</IconBtn>
          </span>
        </div>
        {confirmDelete === f.id && (
          <div className="my-1 rounded-md border border-[var(--border)] bg-[var(--bg-card)] p-2 text-[11px] text-[var(--text-secondary)]" style={{ marginLeft: 4 + depth * 14 }}>
            <p className="mb-1.5">
              {tt('library.folders.delete_confirm', 'Delete "{name}"? Your work stays in the Library.').replace('{name}', f.name)}
              {kids.length ? ` ${tt('library.folders.delete_moves_up', 'Folders inside it move up a level.')}` : ''}
            </p>
            <div className="flex gap-1.5">
              <button onClick={() => { send({ type: 'folder_delete', id: f.id }); setConfirmDelete(null); }} className="rounded bg-red-500/20 px-2 py-0.5 text-red-300">{tt('library.folders.delete_yes', 'Delete folder')}</button>
              <button onClick={() => setConfirmDelete(null)} className="rounded px-2 py-0.5 text-[var(--text-muted)]">{tt('common.cancel', 'Cancel')}</button>
            </div>
          </div>
        )}
        {isOpen && kids.map((k) => treeNode(k, depth + 1))}
      </div>
    );
  };

  const members = open?.members ?? [];
  const lost = open ? new Set(missing[open.id] ?? []) : new Set<string>();

  return (
    <div className="flex items-start gap-4">
      {/* The tree */}
      {!treeOpen ? (
        <CollapsedStrip folders={folders} height={treeHeight} boxRef={treeBox} onOpenFolder={(id) => openFolder(id)} onToggle={toggleTree} />
      ) : (
      <aside ref={treeBox} className="sticky top-2 flex w-56 shrink-0 flex-col self-start rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-2" style={{ height: treeHeight }}>
        <div
          {...dropTarget(null)}
          onClick={() => openFolder(null)}
          className={`mb-1 flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-[12px] font-medium ${
            dropOn === '__top' ? 'bg-[var(--accent)]/25' : openId === null ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'
          }`}
        >
          <span>{tt('library.folders.title', 'Folders')}</span>
          <span className="text-[10px] font-normal text-[var(--text-muted)]">{folders.length || ''}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {childrenOf(folders, null).map((f) => treeNode(f, 0))}
          {folders.length === 0 && (
            <p className="px-2 py-3 text-[11px] leading-relaxed text-[var(--text-secondary)]">
              {tt('library.folders.empty_tree', 'Make folders to organise your work your own way. Nothing moves: a folder just points at work, and one piece can be in several.')}
            </p>
          )}
        </div>
        <CollapseTab open onToggle={toggleTree} />
      </aside>
      )}

      {/* The open folder */}
      <section className="min-w-0 flex-1" {...(openId ? dropTarget(openId) : {})}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <nav className="flex min-w-0 flex-1 items-center gap-1 text-[12px]">
            <button onClick={() => openFolder(null)} className={crumbs.length ? 'text-[var(--text-muted)] hover:text-[var(--text-primary)]' : 'font-medium text-[var(--text-primary)]'}>
              {tt('library.folders.title', 'Folders')}
            </button>
            {crumbs.map((c, i) => (
              <span key={c.id} className="flex min-w-0 items-center gap-1">
                <span className="text-[var(--text-muted)]">/</span>
                <button
                  onClick={() => openFolder(c.id)}
                  className={`truncate ${i === crumbs.length - 1 ? 'font-medium text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                >
                  {c.name}
                </button>
              </span>
            ))}
          </nav>
          {making ? (
            <span className="flex items-center gap-1">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') makeFolder(); if (e.key === 'Escape') { setMaking(false); setNewName(''); } }}
                placeholder={tt('library.folders.new_placeholder', 'New folder')}
                className="w-44 rounded-lg border border-[var(--accent)] bg-transparent px-2 py-1 text-xs text-[var(--text-primary)] outline-none"
              />
              <button onClick={makeFolder} disabled={!newName.trim()} className="rounded-lg bg-[var(--accent)]/15 px-2.5 py-1 text-xs font-medium text-[var(--accent)] disabled:opacity-40">
                {tt('library.folders.create', 'Add')}
              </button>
            </span>
          ) : (
            <button onClick={() => setMaking(true)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              + {open ? tt('library.folders.new_inside', 'Folder inside') : tt('library.folders.new', 'New folder')}
            </button>
          )}
          {open && (
            <button
              onClick={() => setDownloading((d) => !d)}
              title={tt('library.export.button_title', 'Download this folder as a real folder or a zip')}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              {tt('library.export.button', 'Download')}
            </button>
          )}
          <button
            onClick={() => send({ type: 'library_upload', folderId: openId ?? undefined })}
            title={tt('library.folders.upload_title', 'Copy your own files into the Library. They are recorded as your work.')}
            className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1.5 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20"
          >
            {open ? tt('library.folders.upload_here', 'Upload here') : tt('library.folders.upload', 'Upload')}
          </button>
        </div>

        {open && <StyleNote key={open.id} folder={open} />}
        {open?.plan && planOpen && <PlanView key={`plan-${open.id}`} folder={open} states={plans[open.id] ?? {}} onClose={() => setPlanOpen(false)} />}
        {open && downloading && <DownloadPanel key={open.id} folderId={open.id} onClose={() => setDownloading(false)} />}
        {error && <Note tone="error" onClose={onClearError}>{error}</Note>}
        {uploadNote && <Note tone="info" onClose={onClearUploadNote}>{uploadNote}</Note>}

        {/* The pack plan, pinned first: it looks like a folder but never ships in a download. */}
        {open?.plan && !planOpen && (
          <button
            onClick={() => setPlanOpen(true)}
            className="mb-2 flex w-full max-w-md items-center gap-2.5 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-2.5 text-left text-[12px] transition hover:border-[var(--accent)]"
          >
            <span className="text-[var(--accent)]"><PlanGlyph size={18} /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-[var(--text-primary)]">{tt('library.plan.tile', 'Plan')}: {open.plan.title}</span>
              <span className="block truncate text-[10px] text-[var(--text-secondary)]">
                {open.plan.status === 'agreed' ? planProgress(open, plans[open.id]).line : tt('library.plan.waiting', 'Waiting for you to agree it')}
              </span>
            </span>
          </button>
        )}

        {/* Folders inside this one */}
        {subfolders.length > 0 && (
          <div className="mb-4 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
            {subfolders.map((f) => (
              <div
                key={f.id}
                draggable
                onDragStart={(e) => { e.dataTransfer.setData(DRAG_FOLDER, f.id); e.dataTransfer.effectAllowed = 'move'; }}
                {...dropTarget(f.id)}
                onClick={() => openFolder(f.id)}
                className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-3 text-[12px] transition ${
                  dropOn === f.id ? 'border-[var(--accent)] bg-[var(--accent)]/15' : 'border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--accent)]/50'
                }`}
              >
                <span className="text-[var(--accent)]"><FolderGlyph size={18} /></span>
                <span className="min-w-0 flex-1 truncate text-[var(--text-primary)]">{f.name}</span>
                <span className="text-[10px] text-[var(--text-muted)]">{countIn(f.id) || ''}</span>
              </div>
            ))}
          </div>
        )}

        {/* What's in it */}
        {open && members.length === 0 && subfolders.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[var(--border)] p-10 text-center text-xs text-[var(--text-secondary)]">
            {tt('library.folders.empty', 'Nothing here yet. Use the folder button on any card, in any tab, or drag work here.')}
          </div>
        )}
        {members.length > 0 && (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
            {members.map((m) => {
              const item = items.get(m.ref);
              const isFile = m.ref.startsWith('file:');
              return (
                <div key={m.ref} className="group relative">
                  {item ? item.card : (
                    <div className="flex h-full min-h-[150px] flex-col justify-center rounded-xl border border-dashed border-[var(--border)] p-3 text-[11px] text-[var(--text-secondary)]">
                      <p className="truncate font-medium text-[var(--text-primary)]">{isFile ? m.ref.slice(5).split('/').pop() : m.ref}</p>
                      <p className="mt-1">
                        {isFile && lost.has(m.ref.slice(5))
                          ? tt('library.folders.file_missing', 'This file isn\'t there now. If it is on a drive that isn\'t plugged in, it will come back.')
                          : tt('library.folders.other_project', 'A file in another project. Open that project to see it.')}
                      </p>
                    </div>
                  )}
                  <button
                    onClick={() => send({ type: 'folder_remove', id: open!.id, refs: [m.ref] })}
                    title={tt('library.folders.remove', 'Take out of this folder (the work stays in the Library)')}
                    className="absolute right-1.5 top-1.5 z-20 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] text-white opacity-0 transition group-hover:opacity-100"
                  >
                    ✕
                  </button>
                  {item?.parts && item.parts.length > 1 && (
                    <div className="mt-1">
                      <button
                        onClick={() => setPicking(picking === m.ref ? null : m.ref)}
                        className="text-[10px] text-[var(--accent)] hover:underline"
                      >
                        {m.pick?.length
                          ? tt('library.folders.picked', '{n} of {total} chosen').replace('{n}', String(m.pick.length)).replace('{total}', String(item.parts.length))
                          : tt('library.folders.whole', 'All {total} designs').replace('{total}', String(item.parts.length))}
                      </button>
                      {picking === m.ref && (
                        <div className="mt-1 rounded-md border border-[var(--border)] bg-[var(--bg-card)] p-2">
                          {item.parts.map((p) => {
                            const on = !m.pick?.length || m.pick.includes(p.key);
                            return (
                              <label key={p.key} className="flex items-center gap-2 py-0.5 text-[11px] text-[var(--text-primary)]">
                                <input
                                  type="checkbox"
                                  checked={on}
                                  onChange={() => {
                                    const current = m.pick?.length ? m.pick : item.parts!.map((x) => x.key);
                                    const next = on ? current.filter((k) => k !== p.key) : [...current, p.key];
                                    if (next.length === 0) return; // something has to stay: take it out of the folder instead
                                    send({ type: 'folder_pick', id: open!.id, ref: m.ref, pick: next.length === item.parts!.length ? [] : next });
                                  }}
                                  className="h-3 w-3 accent-[var(--accent)]"
                                />
                                <span className="truncate">{p.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {!open && folders.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[var(--border)] p-10 text-center">
            <p className="text-sm font-medium text-[var(--text-primary)]">{tt('library.folders.start_title', 'Your folders')}</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-[var(--text-secondary)]">
              {tt('library.folders.start_body', 'Name a folder, then add work from any tab with the folder button on its card, or by dragging it. Upload your own files too.')}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="rounded px-1 text-[11px] text-[var(--text-muted)] hover:bg-[var(--accent)]/15 hover:text-[var(--text-primary)]"
    >
      {children}
    </button>
  );
}

function Note({ tone, onClose, children }: { tone: 'error' | 'info'; onClose: () => void; children: ReactNode }) {
  return (
    <div className={`mb-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${tone === 'error' ? 'border-red-500/40 bg-red-500/10 text-red-200' : 'border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--text-primary)]'}`}>
      <span className="flex-1">{children}</span>
      <button onClick={onClose} className="text-[var(--text-muted)]" aria-label="Close">✕</button>
    </div>
  );
}

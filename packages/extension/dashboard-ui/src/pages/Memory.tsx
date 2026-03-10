import { useState, useMemo } from 'react';
import { post } from '../App';
import { SectionGroup } from '../components/SectionGroup';
import { SearchIcon, PencilIcon, TrashIcon } from '../components/Icons';
import type { MemoryEntry } from '../types/messages';

interface MemoryProps {
  memories: MemoryEntry[];
}

export function Memory({ memories }: MemoryProps) {
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return q ? memories.filter(m => m.content.toLowerCase().includes(q)) : memories;
  }, [memories, search]);

  function startEdit(m: MemoryEntry) {
    setEditingId(m.id);
    setEditText(m.content);
  }

  function saveEdit(m: MemoryEntry) {
    if (editText.trim() && editText !== m.content) {
      post({ type: 'upsert_memory', id: m.id, content: editText.trim() });
    }
    setEditingId(null);
  }

  function confirmDelete(id: string) {
    post({ type: 'delete_memory', id });
    setConfirmDeleteId(null);
  }

  return (
    <div className="max-w-3xl">
      {/* Page Header */}
      <div className="mb-10">
        <h1 className="text-2xl font-bold">Memory</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Things Ava remembers about you and your projects.
        </p>
      </div>

      {/* ── Search & List ──────────────────────────────────────── */}
      <SectionGroup
        label="Saved Memories"
        count={`${filtered.length} ${filtered.length === 1 ? 'memory' : 'memories'}${search ? ` matching "${search}"` : ''}`}
      >
        {/* Search */}
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search memories..."
            className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] py-2.5 pl-10 pr-4 text-sm text-white placeholder-[var(--text-muted)] outline-none transition focus:border-[var(--accent)]"
          />
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border-card)] bg-[var(--bg-card)] p-8 text-center text-sm text-[var(--text-muted)]">
            {search ? 'No memories match your search.' : 'No memories yet. Ava will remember things as you work together.'}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map(m => (
              <div
                key={m.id}
                className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5"
              >
                {editingId === m.id ? (
                  <div>
                    <textarea
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      rows={3}
                      className="mb-3 w-full resize-y rounded-lg border border-[var(--accent)] bg-[var(--bg-input)] p-3 text-sm text-white outline-none"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Escape') setEditingId(null);
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveEdit(m);
                      }}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEdit(m)}
                        className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--accent-hover)]"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="rounded-lg border border-[var(--border-input)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-input)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <p className="flex-1 text-sm leading-relaxed">{m.content}</p>
                    <div className="flex shrink-0 gap-1">
                      <button
                        onClick={() => startEdit(m)}
                        className="rounded p-1.5 text-[var(--text-muted)] transition hover:bg-[var(--bg-input)] hover:text-white"
                        title="Edit"
                      >
                        <PencilIcon className="h-3.5 w-3.5" />
                      </button>
                      {confirmDeleteId === m.id ? (
                        <>
                          <button
                            onClick={() => confirmDelete(m.id)}
                            className="rounded bg-red-500 px-2 py-1 text-[10px] font-semibold text-white transition hover:bg-red-600"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="rounded px-2 py-1 text-[10px] text-[var(--text-muted)] transition hover:bg-[var(--bg-input)]"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(m.id)}
                          className="rounded p-1.5 text-[var(--text-muted)] transition hover:bg-red-500/10 hover:text-red-400"
                          title="Delete"
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {m.created_at && editingId !== m.id && (
                  <p className="mt-2 text-[10px] text-[var(--text-muted)]">
                    {new Date(m.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionGroup>
    </div>
  );
}

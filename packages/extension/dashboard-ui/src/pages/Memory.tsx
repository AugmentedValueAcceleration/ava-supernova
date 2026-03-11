import { useState, useMemo } from 'react';
import { post } from '../App';
import { SectionGroup } from '../components/SectionGroup';
import { SearchIcon, PencilIcon, TrashIcon } from '../components/Icons';
import type { MemoryEntry, MemoryCategory } from '../types/messages';

const CATEGORY_COLORS: Record<string, string> = {
  pattern: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  preference: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  architecture: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  'bug-fix': 'bg-red-500/15 text-red-400 border-red-500/20',
  convention: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  'tool-config': 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
  decision: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20',
  person: 'bg-pink-500/15 text-pink-400 border-pink-500/20',
  general: 'bg-gray-500/15 text-gray-400 border-gray-500/20',
};

const ALL_CATEGORIES: MemoryCategory[] = [
  'pattern', 'preference', 'architecture', 'bug-fix',
  'convention', 'tool-config', 'decision', 'person', 'general',
];

function CategoryBadge({ category }: { category: string | null }) {
  const cat = category ?? 'general';
  const colors = CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.general;
  const label = cat.charAt(0).toUpperCase() + cat.slice(1).replace('-', ' ');
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${colors}`}>
      {label}
    </span>
  );
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function isStale(entry: MemoryEntry): boolean {
  const lastActivity = entry.last_recalled_at ?? entry.updated_at ?? entry.created_at;
  if (!lastActivity) return false;
  const daysSince = (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24);
  return daysSince > 90;
}

interface MemoryProps {
  memories: MemoryEntry[];
}

export function Memory({ memories }: MemoryProps) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Category counts for filter badges
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of memories) {
      const cat = m.category ?? 'general';
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return counts;
  }, [memories]);

  const filtered = useMemo(() => {
    let result = memories;
    if (categoryFilter) {
      result = result.filter(m => (m.category ?? 'general') === categoryFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(m =>
        m.content.toLowerCase().includes(q) ||
        m.tags?.some(t => t.toLowerCase().includes(q))
      );
    }
    return result;
  }, [memories, search, categoryFilter]);

  const staleCount = useMemo(() => memories.filter(isStale).length, [memories]);

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
          Structured, categorized knowledge Ava remembers across conversations.
        </p>
      </div>

      {/* Stats Bar */}
      {memories.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
          <span>{memories.length} {memories.length === 1 ? 'memory' : 'memories'}</span>
          <span className="text-[var(--border-card)]">|</span>
          <span>{Object.keys(categoryCounts).length} categories</span>
          {staleCount > 0 && (
            <>
              <span className="text-[var(--border-card)]">|</span>
              <span className="text-amber-400">{staleCount} stale (90+ days)</span>
            </>
          )}
        </div>
      )}

      {/* Category Filters */}
      {memories.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            onClick={() => setCategoryFilter(null)}
            className={`rounded-full border px-3 py-1 text-[11px] font-medium transition ${
              categoryFilter === null
                ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]'
                : 'border-[var(--border-card)] text-[var(--text-muted)] hover:border-[var(--accent)]/50'
            }`}
          >
            All ({memories.length})
          </button>
          {ALL_CATEGORIES.filter(c => categoryCounts[c]).map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
              className={`rounded-full border px-3 py-1 text-[11px] font-medium transition ${
                categoryFilter === cat
                  ? CATEGORY_COLORS[cat]
                  : 'border-[var(--border-card)] text-[var(--text-muted)] hover:border-[var(--accent)]/50'
              }`}
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1).replace('-', ' ')} ({categoryCounts[cat]})
            </button>
          ))}
        </div>
      )}

      {/* Search & List */}
      <SectionGroup
        label="Saved Memories"
        count={`${filtered.length} ${filtered.length === 1 ? 'memory' : 'memories'}${search ? ` matching "${search}"` : ''}${categoryFilter ? ` in ${categoryFilter}` : ''}`}
      >
        {/* Search */}
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search memories and tags..."
            className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] py-2.5 pl-10 pr-4 text-sm text-white placeholder-[var(--text-muted)] outline-none transition focus:border-[var(--accent)]"
          />
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border-card)] bg-[var(--bg-card)] p-8 text-center text-sm text-[var(--text-muted)]">
            {search || categoryFilter
              ? 'No memories match your filters.'
              : 'No memories yet. Ava will remember things as you work together — patterns, preferences, decisions, and more.'}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map(m => (
              <div
                key={m.id}
                className={`rounded-xl border bg-[var(--bg-card)] p-5 ${
                  isStale(m) ? 'border-amber-500/20' : 'border-[var(--border-card)]'
                }`}
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
                  <div>
                    {/* Header: category badge + actions */}
                    <div className="mb-2 flex items-center gap-2">
                      <CategoryBadge category={m.category} />
                      {isStale(m) && (
                        <span className="text-[10px] text-amber-400 font-medium">Stale</span>
                      )}
                      {m.tags && m.tags.length > 0 && (
                        <div className="flex gap-1 ml-1">
                          {m.tags.map(tag => (
                            <span key={tag} className="text-[10px] text-[var(--text-muted)] bg-white/5 rounded px-1.5 py-0.5">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="ml-auto flex shrink-0 gap-1">
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

                    {/* Content */}
                    <p className="text-sm leading-relaxed">{m.content}</p>

                    {/* Footer metadata */}
                    <div className="mt-2 flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
                      {m.created_at && <span>Created {formatDate(m.created_at)}</span>}
                      {m.updated_at && m.updated_at !== m.created_at && (
                        <span>Updated {formatDate(m.updated_at)}</span>
                      )}
                      {(m.recall_count ?? 0) > 0 && (
                        <span>Recalled {m.recall_count}x</span>
                      )}
                      <span className="text-[var(--border-card)]">{m.scope}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionGroup>
    </div>
  );
}

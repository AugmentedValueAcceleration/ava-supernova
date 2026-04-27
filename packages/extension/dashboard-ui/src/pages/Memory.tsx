import { useState, useMemo, useEffect } from 'react';
import { t, useLocale } from '../i18n';
import { post } from '../App';
import { SectionGroup } from '../components/SectionGroup';
import { StorageBadge } from '../components/StorageBadge';
import { SearchIcon, PencilIcon, TrashIcon } from '../components/Icons';
import type { MemoryEntry, MemoryCategory, GraphStats, ContradictionPair, ProceduralPatternUI } from '../types/messages';
import { postData, postLoad, getDataMode } from '../lib/data-mode';

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

type ViewMode = 'active' | 'stale' | 'archived' | 'contradictions' | 'patterns';

/** Confidence badge — color-coded by confidence level. */
function ConfidenceBadge({ confidence }: { confidence?: number }) {
  if (confidence === undefined || confidence === null) return null;
  const pct = Math.round(confidence * 100);
  const color = confidence >= 0.7
    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
    : confidence >= 0.4
      ? 'bg-amber-500/15 text-amber-400 border-amber-500/20'
      : 'bg-red-500/15 text-red-400 border-red-500/20';
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${color}`}>
      {pct}%
    </span>
  );
}

/** Source badge — shows how the memory was captured. */
function SourceBadge({ source }: { source?: string }) {
  if (!source) return null;
  const labels: Record<string, string> = {
    'user-explicit': 'explicit',
    'auto-extract': 'auto',
    'llm-extract': 'LLM',
    'compression': 'compressed',
    'procedural': 'learned',
    'ambient': 'ambient',
    'tool-save': 'tool',
    'migrated': 'migrated',
  };
  return (
    <span className="inline-block rounded-full border border-gray-500/20 bg-gray-500/10 px-2 py-0.5 text-[10px] font-medium text-gray-400">
      {labels[source] ?? source}
    </span>
  );
}

/** Graph health stats bar. */
function GraphStatsBar({ stats, brain }: {
  stats: GraphStats | null;
  brain: { brief: string; nodeCount: number; confidenceAvg: number; lastSessionDate: string } | null;
}) {
  if (!stats && !brain) return null;
  return (
    <div className="mb-4 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4">
      {brain?.brief && (
        <div className="mb-3 rounded-lg border border-purple-500/20 bg-purple-500/5 p-3">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-purple-400">Project Brain</p>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed whitespace-pre-line">{brain.brief}</p>
        </div>
      )}
      {stats && (
        <div className="grid grid-cols-4 gap-3">
          <div className="text-center">
            <p className="text-lg font-light text-white">{stats.activeNodes}</p>
            <p className="text-[10px] text-[var(--text-muted)]">Active</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-light text-white">{stats.edges}</p>
            <p className="text-[10px] text-[var(--text-muted)]">Edges</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-light" style={{ color: stats.avgConfidence >= 0.6 ? '#34d399' : stats.avgConfidence >= 0.3 ? '#fbbf24' : '#f87171' }}>
              {Math.round(stats.avgConfidence * 100)}%
            </p>
            <p className="text-[10px] text-[var(--text-muted)]">Avg Confidence</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-light text-white">{stats.crystallisedPatterns}</p>
            <p className="text-[10px] text-[var(--text-muted)]">Patterns</p>
          </div>
        </div>
      )}
    </div>
  );
}

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

function BranchBadge({ branch }: { branch: string }) {
  return (
    <span className="inline-block rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-400">
      {branch}
    </span>
  );
}

/** Parse and render memory content — handles raw JSON store blobs gracefully */
function MemoryContent({ content }: { content: string }) {
  try {
    const parsed = JSON.parse(content);

    if (parsed.entries && Array.isArray(parsed.entries)) {
      return (
        <div className="space-y-2">
          {parsed.entries.map((entry: Record<string, unknown>, i: number) => (
            <div key={String(entry.id ?? i)} className="rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] p-3">
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                {String(entry.content ?? '')}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-[var(--text-muted)]">
                {entry.category ? (
                  <span className={`rounded-full border px-2 py-0.5 font-medium ${
                    CATEGORY_COLORS[String(entry.category)] ?? CATEGORY_COLORS.general
                  }`}>
                    {String(entry.category)}
                  </span>
                ) : null}
                {Array.isArray(entry.tags) && entry.tags.map((tag: unknown, ti: number) => (
                  <span key={ti} className="rounded bg-white/5 px-1.5 py-0.5">{String(tag)}</span>
                ))}
                {entry.recallCount != null && Number(entry.recallCount) > 0 && (
                  <span>Recalled {String(entry.recallCount)}x</span>
                )}
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (typeof parsed.content === 'string') {
      return (
        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
          {parsed.content}
        </p>
      );
    }

    // Some other JSON — format nicely
    return (
      <pre className="text-sm leading-relaxed whitespace-pre-wrap break-words font-mono text-xs">
        {JSON.stringify(parsed, null, 2)}
      </pre>
    );
  } catch {
    // Not JSON — render as plain text
    return (
      <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">{content}</div>
    );
  }
}

/** Extract readable text from JSON blob content for editing */
function getEditableContent(content: string): string {
  try {
    const parsed = JSON.parse(content);
    if (parsed.entries && Array.isArray(parsed.entries)) {
      return parsed.entries
        .map((e: Record<string, unknown>) => String(e.content ?? ''))
        .filter(Boolean)
        .join('\n\n');
    }
    if (typeof parsed.content === 'string') return parsed.content;
  } catch { /* not JSON */ }
  return content;
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

function daysSinceActivity(entry: MemoryEntry): number {
  const lastActivity = entry.last_recalled_at ?? entry.updated_at ?? entry.created_at;
  if (!lastActivity) return 0;
  return Math.floor((Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24));
}

// Simple archive icon (box with arrow)
function ArchiveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="12" height="4" rx="1" />
      <path d="M3 6v7a1 1 0 001 1h8a1 1 0 001-1V6" />
      <path d="M6 9h4" />
    </svg>
  );
}

// Restore icon (arrow coming out of box)
function RestoreIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6v7a1 1 0 001 1h8a1 1 0 001-1V6" />
      <rect x="2" y="2" width="12" height="4" rx="1" />
      <path d="M8 12V8" />
      <path d="M6 10l2-2 2 2" />
    </svg>
  );
}

interface MemoryProps {
  memories: MemoryEntry[];
  mode?: 'platform' | 'byok';
  serverTotal?: number;
  serverHasMore?: boolean;
  // v3 graph data
  graphStats?: GraphStats | null;
  contradictions?: ContradictionPair[];
  patterns?: ProceduralPatternUI[];
  projectBrain?: { brief: string; stack: string[]; keyDecisions: string[]; confidenceAvg: number; nodeCount: number; lastSessionDate: string } | null;
}

export function Memory({ memories, serverTotal, serverHasMore, graphStats, contradictions, patterns, projectBrain }: MemoryProps) {
  useLocale();
  const dataMode = getDataMode();
  const isLocal = dataMode === 'local';
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('active');
  const [loadingMore, setLoadingMore] = useState(false);

  // Refresh memories from host when page mounts
  useEffect(() => {
    postLoad({ type: 'load_local_memories' }, { type: 'load_memories' });
  }, [dataMode]);

  // Partition entries
  const { activeEntries, staleEntries, archivedEntries } = useMemo(() => {
    const active: MemoryEntry[] = [];
    const stale: MemoryEntry[] = [];
    const archived: MemoryEntry[] = [];

    for (const m of memories) {
      if (m.archived) {
        archived.push(m);
      } else if (isStale(m)) {
        stale.push(m);
      } else {
        active.push(m);
      }
    }
    return { activeEntries: active, staleEntries: stale, archivedEntries: archived };
  }, [memories]);

  // Current view's entries
  const viewEntries = viewMode === 'active' ? activeEntries
    : viewMode === 'stale' ? staleEntries
    : archivedEntries;

  // Category counts for current view
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of viewEntries) {
      const cat = m.category ?? 'general';
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return counts;
  }, [viewEntries]);

  // Branch counts
  const branchCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of memories) {
      if (m.branch && !m.archived) {
        counts[m.branch] = (counts[m.branch] ?? 0) + 1;
      }
    }
    return counts;
  }, [memories]);

  const filtered = useMemo(() => {
    let result = viewEntries;
    if (categoryFilter) {
      result = result.filter(m => (m.category ?? 'general') === categoryFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(m =>
        m.content.toLowerCase().includes(q) ||
        m.tags?.some(t => t.toLowerCase().includes(q)) ||
        m.branch?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [viewEntries, search, categoryFilter]);

  function loadMore() {
    if (dataMode !== 'local' && serverHasMore) {
      setLoadingMore(true);
      post({ type: 'load_more_memories' });
      // loadingMore will be cleared when new memories arrive
      setTimeout(() => setLoadingMore(false), 5000); // fallback timeout
    }
  }

  // Clear loading state when memories change (new batch arrived)
  useEffect(() => { setLoadingMore(false); }, [memories.length]);
  // Only clear deletingAll when memories are actually empty
  useEffect(() => { if (deletingAll && memories.length === 0) setDeletingAll(false); }, [memories.length, deletingAll]);

  function startEdit(m: MemoryEntry) {
    setEditingId(m.id);
    setEditText(getEditableContent(m.content));
  }

  function saveEdit(m: MemoryEntry) {
    if (editText.trim() && editText !== m.content) {
      postData(
        { type: 'upsert_local_memory', id: m.id, content: editText.trim() },
        { type: 'upsert_memory', id: m.id, content: editText.trim() },
      );
    }
    setEditingId(null);
  }

  function confirmDelete(id: string) {
    postData(
      { type: 'delete_local_memory', id },
      { type: 'delete_memory', id },
    );
    setConfirmDeleteId(null);
  }

  function deleteAllMemories(scope: 'local' | 'cloud' | 'both') {
    setDeletingAll(true);
    if (scope === 'local' || scope === 'both') post({ type: 'delete_all_local_memories' });
    if (scope === 'cloud' || scope === 'both') post({ type: 'delete_all_memories' });
    setConfirmDeleteAll(false);
    setTimeout(() => setDeletingAll(false), 30000);
  }

  // Listen for error events to clear the deleting state
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'error' && deletingAll) {
        setDeletingAll(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [deletingAll]);

  function archiveEntry(id: string) {
    postData(
      { type: 'archive_local_memory', id },
      { type: 'archive_memory', id },
    );
  }

  function restoreEntry(id: string) {
    postData(
      { type: 'restore_local_memory', id },
      { type: 'restore_memory', id },
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      {/* Page Header — mirrors IDE MemoryPage at DashboardPages.tsx:6242-6264. */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[22px] font-semibold text-[#cdd6f4]">{t('dash.memory.title')}</h1>
            <StorageBadge />
          </div>
          <p className="mt-1.5 text-[13px] text-[#6c7086]">
            {t('dash.memory.subtitle')}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => postLoad({ type: 'load_local_memories' }, { type: 'load_memories' })}
            className="rounded-lg border border-[rgba(168,85,247,0.2)] bg-transparent px-3 py-1.5 text-xs text-[#9ca3af] transition hover:text-white"
            title="Refresh memories"
          >
            Refresh
          </button>
          {memories.length > 0 && !deletingAll && (
            <button
              onClick={() => setConfirmDeleteAll(true)}
              className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs text-[#f87171] transition hover:bg-red-500/20"
            >
              Delete All
            </button>
          )}
        </div>
      </div>

      {/* Deleting progress banner */}
      {deletingAll && !confirmDeleteAll && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
          <div>
            <p className="text-sm text-amber-400">Deleting all memories... This may take a moment.</p>
            <p className="text-xs text-amber-400/60 mt-1">Please stay on this page — leaving will interrupt the deletion.</p>
          </div>
        </div>
      )}

      {/* Delete All Confirmation */}
      {confirmDeleteAll && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-sm font-medium text-red-400 mb-2">Delete all memories?</p>
          <p className="text-xs text-[var(--text-muted)] mb-4">This is permanent and cannot be undone.</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => deleteAllMemories('local')}
              disabled={deletingAll}
              className="rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-4 py-1.5 text-xs font-medium text-emerald-400 transition hover:bg-emerald-500/25 disabled:opacity-50"
            >
              Local Only
            </button>
            {dataMode !== 'local' &&(
              <button
                onClick={() => deleteAllMemories('cloud')}
                disabled={deletingAll}
                className="rounded-lg border border-blue-500/30 bg-blue-500/15 px-4 py-1.5 text-xs font-medium text-blue-400 transition hover:bg-blue-500/25 disabled:opacity-50"
              >
                Cloud Only
              </button>
            )}
            {dataMode !== 'local' &&(
              <button
                onClick={() => deleteAllMemories('both')}
                disabled={deletingAll}
                className="rounded-lg bg-red-500 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-red-600 disabled:opacity-50"
              >
                Both
              </button>
            )}
            <button
              onClick={() => setConfirmDeleteAll(false)}
              className="rounded-lg border border-[var(--border-card)] px-4 py-1.5 text-xs font-medium text-[var(--text-muted)] transition hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLocal && (
        <div className="mb-6 rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] px-4 py-3 text-xs text-[var(--text-muted)]">
          Memories stored locally — connect an account to sync across devices.
        </div>
      )}

      {/* Stats Bar */}
      {memories.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
          <span>{activeEntries.length} active</span>
          <span className="text-[var(--border-card)]">|</span>
          <span>{Object.keys(categoryCounts).length} categories</span>
          {staleEntries.length > 0 && (
            <>
              <span className="text-[var(--border-card)]">|</span>
              <span className="text-amber-400">{staleEntries.length} stale</span>
            </>
          )}
          {archivedEntries.length > 0 && (
            <>
              <span className="text-[var(--border-card)]">|</span>
              <span className="text-[var(--text-muted)]">{archivedEntries.length} archived</span>
            </>
          )}
          {Object.keys(branchCounts).length > 0 && (
            <>
              <span className="text-[var(--border-card)]">|</span>
              <span className="text-violet-400">{Object.values(branchCounts).reduce((a, b) => a + b, 0)} branch-scoped</span>
            </>
          )}
        </div>
      )}

      {/* v3 Graph Stats + Brain Preview */}
      <GraphStatsBar stats={graphStats ?? null} brain={projectBrain ?? null} />

      {/* View Mode Tabs */}
      {(memories.length > 0 || (contradictions && contradictions.length > 0) || (patterns && patterns.length > 0)) && (
        <div className="mb-4 flex gap-1 rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] p-1">
          {[
            { key: 'active' as ViewMode, label: 'Active', count: activeEntries.length },
            { key: 'stale' as ViewMode, label: 'Stale', count: staleEntries.length },
            { key: 'archived' as ViewMode, label: 'Archived', count: archivedEntries.length },
            ...(contradictions && contradictions.length > 0 ? [{ key: 'contradictions' as ViewMode, label: 'Conflicts', count: contradictions.length }] : []),
            ...(patterns && patterns.length > 0 ? [{ key: 'patterns' as ViewMode, label: 'Patterns', count: patterns.length }] : []),
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => { setViewMode(tab.key); setCategoryFilter(null); }}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                viewMode === tab.key
                  ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
                  : 'text-[var(--text-muted)] hover:text-white'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      )}

      {/* Category Filters */}
      {viewEntries.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            onClick={() => setCategoryFilter(null)}
            className={`rounded-full border px-3 py-1 text-[11px] font-medium transition ${
              categoryFilter === null
                ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]'
                : 'border-[var(--border-card)] text-[var(--text-muted)] hover:border-[var(--accent)]/50'
            }`}
          >
            All ({viewEntries.length})
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

      {/* v3 Contradictions panel */}
      {viewMode === 'contradictions' && contradictions && contradictions.length > 0 && (
        <SectionGroup label="Contradictions" count={`${contradictions.length} conflicts to resolve`}>
          <div className="space-y-4">
            {contradictions.map((c, i) => (
              <div key={c.edgeId} className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-red-400">
                  Conflict {i + 1} — {Math.round(c.similarity * 100)}% similar
                </p>
                <div className="space-y-2">
                  <div className="rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] p-3">
                    <div className="mb-1 flex items-center gap-2">
                      <CategoryBadge category={c.nodeA.category} />
                      <ConfidenceBadge confidence={(c.nodeA as any).confidence} />
                    </div>
                    <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{c.nodeA.content.slice(0, 300)}</p>
                  </div>
                  <div className="text-center text-xs text-red-400">contradicts</div>
                  <div className="rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] p-3">
                    <div className="mb-1 flex items-center gap-2">
                      <CategoryBadge category={c.nodeB.category} />
                      <ConfidenceBadge confidence={(c.nodeB as any).confidence} />
                    </div>
                    <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{c.nodeB.content.slice(0, 300)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SectionGroup>
      )}

      {/* v3 Procedural patterns panel */}
      {viewMode === 'patterns' && patterns && patterns.length > 0 && (
        <SectionGroup label="Learned Patterns" count={`${patterns.length} patterns (${patterns.filter(p => p.crystallised).length} crystallised)`}>
          <div className="space-y-3">
            {patterns.sort((a, b) => b.confidence - a.confidence).map(p => (
              <div key={p.id} className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{p.taskType}</span>
                    {p.crystallised && (
                      <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                        crystallised
                      </span>
                    )}
                  </div>
                  <ConfidenceBadge confidence={p.confidence} />
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {p.toolSequence.map((tool, i) => (
                    <span key={i} className="flex items-center gap-1.5">
                      <span className="rounded bg-[var(--bg-input)] px-2 py-0.5 text-[11px] font-mono text-[var(--text-secondary)]">
                        {tool}
                      </span>
                      {i < p.toolSequence.length - 1 && (
                        <span className="text-[10px] text-[var(--text-muted)]">→</span>
                      )}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-[var(--text-muted)]">
                  Observed {p.observationCount}× · Last: {new Date(p.lastObservedAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </SectionGroup>
      )}

      {/* Search & List (for active/stale/archived tabs) */}
      {(viewMode === 'active' || viewMode === 'stale' || viewMode === 'archived') && (
      <SectionGroup
        label={viewMode === 'active' ? 'Active Memories' : viewMode === 'stale' ? 'Stale Memories' : 'Archived Memories'}
        count={`${filtered.length} ${filtered.length === 1 ? 'memory' : 'memories'}${serverTotal && serverTotal > memories.length ? ` (${memories.length} of ${serverTotal} loaded)` : ''}${search ? ` matching "${search}"` : ''}${categoryFilter ? ` in ${categoryFilter}` : ''}`}
      >
        {/* Search */}
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('dash.memory.search')}
            className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] py-2.5 pl-10 pr-4 text-sm text-white placeholder-[var(--text-muted)] outline-none transition focus:border-[var(--accent)]"
          />
        </div>

        {/* Stale mode info banner */}
        {viewMode === 'stale' && staleEntries.length > 0 && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-300">
            These memories haven't been recalled in 90+ days. Review them — archive what's no longer needed, update what's outdated.
          </div>
        )}

        {/* Archived mode info banner */}
        {viewMode === 'archived' && archivedEntries.length > 0 && (
          <div className="rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] px-4 py-3 text-xs text-[var(--text-muted)]">
            Archived memories are excluded from Ava's active recall. Restore any that are still relevant.
          </div>
        )}

        {/* List */}
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border-card)] bg-[var(--bg-card)] p-8 text-center text-sm text-[var(--text-muted)]">
            {search || categoryFilter
              ? 'No memories match your filters.'
              : viewMode === 'archived'
                ? 'No archived memories.'
                : viewMode === 'stale'
                  ? 'No stale memories — everything is fresh!'
                  : 'No memories yet. Ava will remember things as you work together — patterns, preferences, decisions, and more.'}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map(m => (
              <div
                key={m.id}
                className={`rounded-xl border bg-[var(--bg-card)] p-5 ${
                  m.archived
                    ? 'border-[var(--border-card)] opacity-60'
                    : isStale(m)
                      ? 'border-amber-500/20'
                      : 'border-[var(--border-card)]'
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
                    {/* Header: category badge + confidence + source + branch + actions */}
                    <div className="mb-2 flex items-center gap-2">
                      <CategoryBadge category={m.category} />
                      <ConfidenceBadge confidence={m.confidence} />
                      <SourceBadge source={m.source} />
                      {m.branch && <BranchBadge branch={m.branch} />}
                      {isStale(m) && !m.archived && (
                        <span className="text-[10px] text-amber-400 font-medium">
                          {daysSinceActivity(m)}d stale
                        </span>
                      )}
                      {m.archived && (
                        <span className="text-[10px] text-[var(--text-muted)] font-medium">Archived</span>
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
                        {m.archived ? (
                          <button
                            onClick={() => restoreEntry(m.id)}
                            className="rounded p-1.5 text-[var(--text-muted)] transition hover:bg-emerald-500/10 hover:text-emerald-400"
                            title="Restore"
                          >
                            <RestoreIcon className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(m)}
                              className="rounded p-1.5 text-[var(--text-muted)] transition hover:bg-[var(--bg-input)] hover:text-white"
                              title="Edit"
                            >
                              <PencilIcon className="h-3.5 w-3.5" />
                            </button>
                            {isStale(m) && (
                              <button
                                onClick={() => archiveEntry(m.id)}
                                className="rounded p-1.5 text-[var(--text-muted)] transition hover:bg-amber-500/10 hover:text-amber-400"
                                title="Archive"
                              >
                                <ArchiveIcon className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </>
                        )}
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
                    <MemoryContent content={m.content} />

                    {/* Footer metadata */}
                    <div className="mt-2 flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
                      {m.created_at && <span>Created {formatDate(m.created_at)}</span>}
                      {m.updated_at && m.updated_at !== m.created_at && (
                        <span>Updated {formatDate(m.updated_at)}</span>
                      )}
                      {(m.recall_count ?? 0) > 0 && (
                        <span>Recalled {m.recall_count}x</span>
                      )}
                      {m.last_recalled_at && (
                        <span>Last recalled {formatDate(m.last_recalled_at)}</span>
                      )}
                      {m.archived_at && (
                        <span>Archived {formatDate(m.archived_at)}</span>
                      )}
                      <span className="text-[var(--border-card)]">{m.scope}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Load more from server */}
            {dataMode !== 'local' &&serverHasMore && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className={`w-full rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] py-3 text-xs font-medium text-[var(--accent)] transition hover:border-[var(--accent)]/50 ${loadingMore ? 'opacity-50 cursor-wait' : ''}`}
              >
                {loadingMore ? 'Loading...' : `Load more (${(serverTotal || 0) - memories.length} remaining)`}
              </button>
            )}
          </div>
        )}
      </SectionGroup>
      )}
    </div>
  );
}

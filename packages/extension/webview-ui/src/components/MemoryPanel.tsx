import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { MemoryEntryUI } from '../types/messages';

interface MemoryPanelProps {
  globalEntries: MemoryEntryUI[];
  projectEntries: MemoryEntryUI[];
  onClose: () => void;
  onSave: (scope: 'global' | 'project', content: string) => void;
  onClear: (scope: 'global' | 'project') => void;
  onArchive: (scope: 'global' | 'project', id: string) => void;
  onRestore: (scope: 'global' | 'project', id: string) => void;
  onDelete: (scope: 'global' | 'project', id: string) => void;
}

type ScopeTab = 'global' | 'project';
type ViewMode = 'active' | 'archived';

const CATEGORY_COLORS: Record<string, string> = {
  pattern: '#3b82f6',
  preference: '#8b5cf6',
  architecture: '#06b6d4',
  'bug-fix': '#ef4444',
  convention: '#f59e0b',
  'tool-config': '#10b981',
  decision: '#f97316',
  person: '#ec4899',
  general: '#6b7280',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days > 30) return `${Math.floor(days / 30)}mo ago`;
  if (days > 0) return `${days}d ago`;
  const hours = Math.floor(diff / 3600000);
  if (hours > 0) return `${hours}h ago`;
  return 'just now';
}

export function MemoryPanel({
  globalEntries,
  projectEntries,
  onClose,
  onSave,
  onClear,
  onArchive,
  onRestore,
  onDelete,
}: MemoryPanelProps) {
  const [scopeTab, setScopeTab] = useState<ScopeTab>('global');
  const [viewMode, setViewMode] = useState<ViewMode>('active');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newContent, setNewContent] = useState('');

  const entries = scopeTab === 'global' ? globalEntries : projectEntries;

  const activeEntries = useMemo(
    () => entries.filter(e => !e.archived),
    [entries],
  );

  const archivedEntries = useMemo(
    () => entries.filter(e => e.archived),
    [entries],
  );

  const displayEntries = viewMode === 'active' ? activeEntries : archivedEntries;

  const handleScopeSwitch = (tab: ScopeTab) => {
    setScopeTab(tab);
    setViewMode('active');
    setConfirmDelete(null);
    setConfirmClear(false);
    setAdding(false);
  };

  const handleDelete = (id: string) => {
    if (confirmDelete === id) {
      onDelete(scopeTab, id);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(id);
      setTimeout(() => setConfirmDelete(null), 3000);
    }
  };

  const handleClear = () => {
    if (confirmClear) {
      onClear(scopeTab);
      setConfirmClear(false);
    } else {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
    }
  };

  const panelRef = useRef<HTMLDivElement>(null);

  const handleAdd = () => {
    if (newContent.trim()) {
      onSave(scopeTab, newContent.trim());
      setNewContent('');
      setAdding(false);
    }
  };

  // Focus trap: Tab/Shift+Tab cycle within panel, Escape closes
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Memory"
      tabIndex={-1}
      className="absolute inset-0 z-50 flex flex-col bg-[var(--vscode-sideBar-background)] outline-none"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--vscode-panel-border)]">
        <span className="text-xs font-semibold uppercase tracking-wider opacity-70">
          Memory v2
        </span>
        <button
          onClick={onClose}
          title="Close"
          className="flex items-center justify-center w-6 h-6 rounded
                     hover:bg-[var(--vscode-toolbar-hoverBackground)]
                     text-[var(--vscode-foreground)] opacity-70 hover:opacity-100
                     bg-transparent border-none cursor-pointer"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.708L7.293 8l-3.646 3.646.707.708L8 8.707z"/>
          </svg>
        </button>
      </div>

      {/* Scope Tabs */}
      <div className="flex border-b border-[var(--vscode-panel-border)]">
        {(['global', 'project'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => handleScopeSwitch(tab)}
            className={`flex-1 px-3 py-1.5 text-xs border-none cursor-pointer transition-colors
              ${scopeTab === tab
                ? 'bg-[var(--vscode-tab-activeBackground,var(--vscode-editor-background))] text-[var(--vscode-foreground)] border-b-2 border-b-[var(--vscode-focusBorder)]'
                : 'bg-transparent text-[var(--vscode-foreground)] opacity-60 hover:opacity-80'
              }`}
          >
            {tab === 'global' ? 'Global' : 'Project'}
            <span className="ml-1 opacity-50">
              ({(tab === 'global' ? globalEntries : projectEntries).filter(e => !e.archived).length})
            </span>
          </button>
        ))}
      </div>

      {/* View Mode Toggle */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[var(--vscode-panel-border)]">
        {(['active', 'archived'] as const).map(mode => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`px-2 py-0.5 rounded text-[10px] border-none cursor-pointer transition-all
              ${viewMode === mode
                ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
                : 'bg-transparent text-[var(--vscode-foreground)] opacity-50 hover:opacity-80'
              }`}
          >
            {mode === 'active' ? `Active (${activeEntries.length})` : `Archived (${archivedEntries.length})`}
          </button>
        ))}
        <div className="flex-1" />
        {viewMode === 'active' && (
          <button
            onClick={() => setAdding(true)}
            className="px-2 py-0.5 rounded text-[10px]
                       bg-transparent text-[var(--vscode-foreground)] opacity-50 hover:opacity-80
                       border-none cursor-pointer"
            title="Add memory"
          >
            + Add
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Add new entry form */}
        {adding && (
          <div className="p-3 border-b border-[var(--vscode-panel-border)]">
            <textarea
              autoFocus
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              placeholder="Enter memory content..."
              className="w-full min-h-[80px] p-2 text-xs font-mono rounded resize-none
                         bg-[var(--vscode-input-background)]
                         text-[var(--vscode-input-foreground)]
                         border border-[var(--vscode-input-border)]
                         outline-none focus:border-[var(--vscode-focusBorder)]"
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleAdd}
                className="px-3 py-1 rounded text-xs
                           bg-[var(--vscode-button-background)]
                           text-[var(--vscode-button-foreground)]
                           hover:bg-[var(--vscode-button-hoverBackground)]
                           border-none cursor-pointer"
              >
                Save
              </button>
              <button
                onClick={() => { setAdding(false); setNewContent(''); }}
                className="px-3 py-1 rounded text-xs
                           bg-transparent text-[var(--vscode-foreground)]
                           hover:bg-[var(--vscode-toolbar-hoverBackground)]
                           border border-[var(--vscode-panel-border)] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {displayEntries.length === 0 ? (
          <div className="flex items-center justify-center h-32 opacity-50 text-xs">
            {viewMode === 'archived'
              ? 'No archived memories.'
              : scopeTab === 'global'
                ? 'No global memories yet. Ava saves memories as you work together.'
                : 'No project memories yet. Ava saves project-specific patterns here.'}
          </div>
        ) : (
          <div className="divide-y divide-[var(--vscode-panel-border)]">
            {displayEntries.map(entry => (
              <MemoryEntryCard
                key={entry.id}
                entry={entry}
                scope={scopeTab}
                isArchived={viewMode === 'archived'}
                confirmDelete={confirmDelete === entry.id}
                onArchive={() => onArchive(scopeTab, entry.id)}
                onRestore={() => onRestore(scopeTab, entry.id)}
                onDelete={() => handleDelete(entry.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-[var(--vscode-panel-border)]">
        {activeEntries.length > 0 && viewMode === 'active' && (
          <button
            onClick={handleClear}
            className={`px-3 py-1 rounded text-xs border-none cursor-pointer transition-all
              ${confirmClear
                ? 'bg-[var(--vscode-errorForeground,#e53935)] text-white'
                : 'bg-transparent text-[var(--vscode-foreground)] opacity-60 hover:opacity-100 hover:bg-[var(--vscode-toolbar-hoverBackground)]'
              }`}
          >
            {confirmClear ? 'Confirm Clear All' : 'Clear All'}
          </button>
        )}
        <div className="flex-1" />
        <span className="text-[10px] opacity-40">
          {scopeTab === 'global' ? '~/.ava/memory.json' : '.ava/memory.json'}
        </span>
      </div>
    </div>
  );
}

// ── Individual Entry Card ─────────────────────────────────────────────────────

function MemoryEntryCard({
  entry,
  scope,
  isArchived,
  confirmDelete,
  onArchive,
  onRestore,
  onDelete,
}: {
  entry: MemoryEntryUI;
  scope: ScopeTab;
  isArchived: boolean;
  confirmDelete: boolean;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const categoryColor = CATEGORY_COLORS[entry.category] ?? '#6b7280';
  const isLong = entry.content.length > 120;

  return (
    <div className="px-3 py-2 hover:bg-[var(--vscode-list-hoverBackground)]">
      {/* Top row: category badge + time */}
      <div className="flex items-center gap-1.5 mb-1">
        <span
          className="inline-block px-1.5 py-0 rounded text-[10px] font-medium"
          style={{ backgroundColor: categoryColor + '22', color: categoryColor }}
        >
          {entry.category}
        </span>
        {entry.branch && (
          <span className="inline-block px-1.5 py-0 rounded text-[10px] font-medium"
                style={{ backgroundColor: '#8b5cf622', color: '#8b5cf6' }}>
            {entry.branch}
          </span>
        )}
        {entry.tags?.map(tag => (
          <span key={tag} className="inline-block px-1 py-0 rounded text-[10px] opacity-50">
            #{tag}
          </span>
        ))}
        <div className="flex-1" />
        <span className="text-[10px] opacity-40" title={entry.updatedAt}>
          {timeAgo(entry.updatedAt)}
        </span>
      </div>

      {/* Content */}
      <div
        className="text-xs leading-relaxed opacity-90 cursor-pointer"
        onClick={() => isLong && setExpanded(!expanded)}
      >
        <pre className="whitespace-pre-wrap font-mono m-0 text-xs">
          {isLong && !expanded ? entry.content.slice(0, 120) + '...' : entry.content}
        </pre>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3 mt-1.5">
        <span className="text-[10px] opacity-30">
          recalled {entry.recallCount}x
        </span>
        {entry.lastRecalledAt && (
          <span className="text-[10px] opacity-30">
            last: {timeAgo(entry.lastRecalledAt)}
          </span>
        )}
        <div className="flex-1" />

        {/* Action buttons */}
        {isArchived ? (
          <>
            <button
              onClick={onRestore}
              title="Restore"
              className="px-1.5 py-0.5 rounded text-[10px] bg-transparent
                         text-[var(--vscode-foreground)] opacity-40 hover:opacity-80
                         border-none cursor-pointer hover:bg-[var(--vscode-toolbar-hoverBackground)]"
            >
              Restore
            </button>
            <button
              onClick={onDelete}
              title={confirmDelete ? 'Confirm delete' : 'Delete permanently'}
              className={`px-1.5 py-0.5 rounded text-[10px] border-none cursor-pointer transition-all
                ${confirmDelete
                  ? 'bg-[var(--vscode-errorForeground,#e53935)] text-white opacity-100'
                  : 'bg-transparent text-[var(--vscode-foreground)] opacity-40 hover:opacity-80 hover:bg-[var(--vscode-toolbar-hoverBackground)]'
                }`}
            >
              {confirmDelete ? 'Confirm' : 'Delete'}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onArchive}
              title="Archive"
              className="px-1.5 py-0.5 rounded text-[10px] bg-transparent
                         text-[var(--vscode-foreground)] opacity-40 hover:opacity-80
                         border-none cursor-pointer hover:bg-[var(--vscode-toolbar-hoverBackground)]"
            >
              Archive
            </button>
            <button
              onClick={onDelete}
              title={confirmDelete ? 'Confirm delete' : 'Delete'}
              className={`px-1.5 py-0.5 rounded text-[10px] border-none cursor-pointer transition-all
                ${confirmDelete
                  ? 'bg-[var(--vscode-errorForeground,#e53935)] text-white opacity-100'
                  : 'bg-transparent text-[var(--vscode-foreground)] opacity-40 hover:opacity-80 hover:bg-[var(--vscode-toolbar-hoverBackground)]'
                }`}
            >
              {confirmDelete ? 'Confirm' : 'Delete'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

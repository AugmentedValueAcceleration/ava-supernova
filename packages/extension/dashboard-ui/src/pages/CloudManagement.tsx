import { useEffect, useState } from 'react';
import { post } from '../App';
import type { AccountInfo, ExtToDashboardMessage } from '../types/messages';
import { SectionGroup } from '../components/SectionGroup';
import { TrashIcon } from '../components/Icons';

interface CloudManagementProps {
  account: AccountInfo | null;
  isConnected: boolean;
}

function fmtStorage(gb: number): string {
  if (gb >= 1000) return `${(gb / 1024).toFixed(2)} TB`;
  if (gb >= 10) return `${Math.round(gb)} GB`;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.round(gb * 1024)} MB`;
}

type WipeMessageType =
  | 'delete_all_memories'
  | 'delete_all_cloud_conversations'
  | 'delete_all_cloud_tasks'
  | 'delete_all_cloud_journal'
  | 'delete_all_cloud_creative';

// One card per cloud-stored category. Each card gets a "Clear all from
// cloud" button that wipes the server-side copy. Local files never leave
// the user's machine — that's the one-line safety guarantee every button
// repeats. If we later wire a listing view (per-item browse + delete),
// it slots into the same card structure.
const CATEGORIES: Array<{
  id: string;
  label: string;
  description: string;
  wipe: WipeMessageType;
  confirmCopy: string;
}> = [
  {
    id: 'memories',
    label: 'Memories',
    description: 'Learned preferences, patterns, architecture decisions, and people Ava remembers.',
    wipe: 'delete_all_memories',
    confirmCopy: 'Delete all memories from the cloud? Local memory files stay on your machine and can re-sync if you re-enable sync.',
  },
  {
    id: 'conversations',
    label: 'Chat History',
    description: 'Every synced chat session — titles, messages, tool calls, and attachments.',
    wipe: 'delete_all_cloud_conversations',
    confirmCopy: 'Delete all chat history from the cloud? Local conversation files stay on your machine.',
  },
  {
    id: 'tasks',
    label: 'Tasks',
    description: 'Your life-management task list — priorities, categories, due dates, subtasks.',
    wipe: 'delete_all_cloud_tasks',
    confirmCopy: 'Delete all tasks from the cloud? Local task data stays on your machine.',
  },
  {
    id: 'journal',
    label: 'Journal',
    description: 'Daily entries from both sides — yours and Ava\'s.',
    wipe: 'delete_all_cloud_journal',
    confirmCopy: 'Delete all journal entries from the cloud? Local entries stay on your machine.',
  },
  {
    id: 'creative',
    label: 'Creative Assets',
    description: 'AI-generated images, music, video, and voice from Creative Studio.',
    wipe: 'delete_all_cloud_creative',
    confirmCopy: 'Delete all creative assets from the cloud? Local files stay; only the cloud copy is removed.',
  },
];

export function CloudManagement({ account, isConnected }: CloudManagementProps) {
  const [toast, setToast] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const [pendingWipe, setPendingWipe] = useState<string | null>(null);

  useEffect(() => {
    if (isConnected) post({ type: 'refresh_storage' });
  }, [isConnected]);

  // Surface wipe results via simple toast, then auto-clear after a few seconds.
  useEffect(() => {
    const onMsg = (e: MessageEvent<ExtToDashboardMessage>) => {
      const data = e.data;
      if (!data) return;
      if (data.type === 'info' && typeof data.message === 'string') {
        setToast({ kind: 'info', text: data.message });
        setPendingWipe(null);
      } else if (data.type === 'error' && typeof data.message === 'string') {
        setToast({ kind: 'error', text: data.message });
        setPendingWipe(null);
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const triggerWipe = (cat: (typeof CATEGORIES)[number]) => {
    if (!window.confirm(cat.confirmCopy)) return;
    setPendingWipe(cat.id);
    post({ type: cat.wipe });
  };

  if (!isConnected) {
    return (
      <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-8 text-center">
        <p className="text-sm text-[var(--text-secondary)]">
          Sign in to see what's in your cloud storage.
        </p>
      </div>
    );
  }

  const storage = account?.storage;

  return (
    <div className="space-y-6">
      {toast && (
        <div
          className={`rounded-lg border px-4 py-2 text-xs ${
            toast.kind === 'error'
              ? 'border-red-500/30 bg-red-500/10 text-red-300'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Header + total storage */}
      <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Cloud Storage</h3>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Your cloud copy. Clearing anything here only touches the cloud —
              local files always stay on your machine.
            </p>
          </div>
          <button
            onClick={() => post({ type: 'refresh_storage' })}
            title="Recalculate storage usage"
            className="shrink-0 rounded-md border border-[var(--border-input)] px-2 py-1 text-[10px] text-[var(--text-muted)] transition hover:text-[var(--text-secondary)] hover:border-[var(--border-card)] bg-transparent cursor-pointer"
          >
            Refresh &#x21bb;
          </button>
        </div>

        {storage && (
          <div className="mt-4">
            <p className="text-2xl font-semibold text-white">
              {fmtStorage(storage.used_gb)}
              <span className="ml-2 text-sm font-normal text-[var(--text-muted)]">of {fmtStorage(storage.total_gb)}</span>
            </p>
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              {fmtStorage(storage.base_gb)} plan
              {storage.addon_gb > 0 && ` + ${fmtStorage(storage.addon_gb)} add-ons`}
            </p>
          </div>
        )}
      </div>

      {/* Per-category cards */}
      <SectionGroup
        label="By type"
        description="Clear everything in a category from your cloud copy. Local data is never touched."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {CATEGORIES.map((cat) => {
            const inFlight = pendingWipe === cat.id;
            return (
              <div
                key={cat.id}
                className="flex flex-col rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-white">{cat.label}</span>
                  <span className="rounded-full bg-[var(--bg-input)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Cloud
                  </span>
                </div>
                <p className="mt-1.5 flex-1 text-[11px] text-[var(--text-muted)] leading-relaxed">
                  {cat.description}
                </p>
                <button
                  onClick={() => triggerWipe(cat)}
                  disabled={inFlight}
                  className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border-input)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] transition hover:border-red-500/30 hover:text-red-300 bg-transparent cursor-pointer disabled:cursor-wait disabled:opacity-50"
                >
                  <TrashIcon className="h-3 w-3" />
                  {inFlight ? 'Clearing…' : 'Clear all from cloud'}
                </button>
              </div>
            );
          })}
        </div>
      </SectionGroup>
    </div>
  );
}

import { useEffect } from 'react';
import { AVA_SITE_BASE } from '@ava/core/billing';
import { post } from '../App';
import type { AccountInfo } from '../types/messages';
import { SectionGroup } from '../components/SectionGroup';
import { ArrowTopRightIcon, TrashIcon } from '../components/Icons';

interface CloudManagementProps {
  account: AccountInfo | null;
  isConnected: boolean;
}

function openUrl(url: string) {
  post({ type: 'open_url', url });
}

function fmtStorage(gb: number): string {
  if (gb >= 1000) return `${(gb / 1024).toFixed(2)} TB`;
  if (gb >= 10) return `${Math.round(gb)} GB`;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.round(gb * 1024)} MB`;
}

// Each card corresponds to one bucket of data the server sums into
// usage.storage_gb_used. Managing items individually lives on the website
// today — each "Manage" button opens the corresponding dashboard page.
// Per-item deletion from inside the extension can land in a follow-up
// once the host-side delete wiring per category is in place.
const CATEGORIES: Array<{
  id: string;
  label: string;
  description: string;
  managePath: string;
}> = [
  {
    id: 'memories',
    label: 'Memories',
    description: 'Learned preferences, patterns, architecture decisions, and people Ava remembers.',
    managePath: '/dashboard/memories',
  },
  {
    id: 'conversations',
    label: 'Chat History',
    description: 'Every synced chat session — titles, messages, tool calls, and attachments.',
    managePath: '/dashboard/history',
  },
  {
    id: 'tasks',
    label: 'Tasks',
    description: 'Your life-management task list — priorities, categories, due dates, subtasks.',
    managePath: '/dashboard/tasks',
  },
  {
    id: 'journal',
    label: 'Journal',
    description: 'Daily entries from both sides — yours and Ava\'s.',
    managePath: '/dashboard/journal',
  },
  {
    id: 'creative',
    label: 'Creative Assets',
    description: 'AI-generated images, music, video, and voice from Creative Studio.',
    managePath: '/dashboard/creative',
  },
];

export function CloudManagement({ account, isConnected }: CloudManagementProps) {
  // Refresh the storage snapshot whenever this tab mounts so the totals at
  // the top reflect reality instead of whatever the nightly pg_cron last
  // wrote. Matches Billing's behaviour. Silent + fire-and-forget.
  useEffect(() => {
    if (isConnected) post({ type: 'refresh_storage' });
  }, [isConnected]);

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
      {/* Header + total storage */}
      <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Cloud Storage</h3>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Your cloud copy. Every item here is mirrored locally — deleting
              from the cloud never touches your local data.
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
        description="Manage each category on the web dashboard — delete individually, bulk-clear, or export."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {CATEGORIES.map((cat) => (
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
                onClick={() => openUrl(`${AVA_SITE_BASE}${cat.managePath}`)}
                className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border-input)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] transition hover:border-[var(--accent)]/30 hover:text-white bg-transparent cursor-pointer"
              >
                Manage on web
                <ArrowTopRightIcon className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      </SectionGroup>

      {/* Nuclear option — wipe everything */}
      <SectionGroup
        label="Danger zone"
        description="Wipe every category from the cloud at once. Local copies always stay on your machine."
      >
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
          <div className="flex items-start gap-3">
            <TrashIcon className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <div className="flex-1">
              <p className="text-xs font-medium text-white">Clear all cloud data</p>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                Removes memories, chats, tasks, journal entries, and creative
                assets from the cloud. Nothing leaves your local machine.
                Handled via the website to keep destructive actions
                out-of-band.
              </p>
              <button
                onClick={() => openUrl(`${AVA_SITE_BASE}/dashboard/cloud?action=clear-all`)}
                className="mt-3 rounded-md border border-red-500/30 px-3 py-1.5 text-[11px] font-medium text-red-300 transition hover:bg-red-500/10 bg-transparent cursor-pointer"
              >
                Open clear-all flow on web
              </button>
            </div>
          </div>
        </div>
      </SectionGroup>
    </div>
  );
}

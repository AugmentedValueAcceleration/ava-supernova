import { useEffect, useState } from 'react';
import { t, useLocale } from '../i18n';
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
//
// Labels / descriptions / confirm copy are resolved through t() at the render
// site — module consts evaluate once at import, so a live t() here would freeze
// to English; the *Key fields are read against the live locale below.
const CATEGORIES: Array<{
  id: string;
  labelKey: string;
  descKey: string;
  wipe: WipeMessageType;
  confirmKey: string;
}> = [
  {
    id: 'memories',
    labelKey: 'dash.cloud.cat.memories',
    descKey: 'dash.cloud.cat.memories_desc',
    wipe: 'delete_all_memories',
    confirmKey: 'dash.cloud.confirm.memories',
  },
  {
    id: 'conversations',
    labelKey: 'dash.nav.chat_history',
    descKey: 'dash.cloud.cat.conversations_desc',
    wipe: 'delete_all_cloud_conversations',
    confirmKey: 'dash.cloud.confirm.conversations',
  },
  {
    id: 'tasks',
    labelKey: 'dash.nav.tasks',
    descKey: 'dash.cloud.cat.tasks_desc',
    wipe: 'delete_all_cloud_tasks',
    confirmKey: 'dash.cloud.confirm.tasks',
  },
  {
    id: 'journal',
    labelKey: 'dash.nav.journal',
    descKey: 'dash.cloud.cat.journal_desc',
    wipe: 'delete_all_cloud_journal',
    confirmKey: 'dash.cloud.confirm.journal',
  },
  {
    id: 'creative',
    labelKey: 'dash.cloud.cat.creative',
    descKey: 'dash.cloud.cat.creative_desc',
    wipe: 'delete_all_cloud_creative',
    confirmKey: 'dash.cloud.confirm.creative',
  },
];

export function CloudManagement({ account, isConnected }: CloudManagementProps) {
  useLocale();
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
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const triggerWipe = (cat: (typeof CATEGORIES)[number]) => {
    if (!window.confirm(t(cat.confirmKey))) return;
    setPendingWipe(cat.id);
    post({ type: cat.wipe });
  };

  if (!isConnected) {
    return (
      <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-8 text-center">
        <p className="text-sm text-[var(--text-secondary)]">
          {t('dash.cloud.signin_prompt')}
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
            <h3 className="text-sm font-semibold text-white">{t('dash.cloud.storage_title')}</h3>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {t('dash.cloud.storage_blurb')}
            </p>
          </div>
          <button
            onClick={() => post({ type: 'refresh_storage' })}
            title={t('dash.cloud.recalculate')}
            className="shrink-0 rounded-md border border-[var(--border-input)] px-2 py-1 text-[10px] text-[var(--text-muted)] transition hover:text-[var(--text-secondary)] hover:border-[var(--border-card)] bg-transparent cursor-pointer"
          >
            {t('health.browse.refresh')} &#x21bb;
          </button>
        </div>

        {storage && (
          <div className="mt-4">
            <p className="text-2xl font-semibold text-white">
              {fmtStorage(storage.used_gb)}
              <span className="ml-2 text-sm font-normal text-[var(--text-muted)]">{t('dash.cloud.of_total', { total: fmtStorage(storage.total_gb) })}</span>
            </p>
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              {t('dash.cloud.plan_amount', { amount: fmtStorage(storage.base_gb) })}
              {storage.addon_gb > 0 && ` ${t('dash.cloud.addons_amount', { amount: fmtStorage(storage.addon_gb) })}`}
            </p>
          </div>
        )}
      </div>

      {/* Per-category cards */}
      <SectionGroup
        label={t('dash.cloud.by_type')}
        description={t('dash.cloud.by_type_desc')}
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
                  <span className="text-sm font-medium text-white">{t(cat.labelKey)}</span>
                  <span className="rounded-full bg-[var(--bg-input)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    {t('dash.chat.cloud')}
                  </span>
                </div>
                <p className="mt-1.5 flex-1 text-[11px] text-[var(--text-muted)] leading-relaxed">
                  {t(cat.descKey)}
                </p>
                <button
                  onClick={() => triggerWipe(cat)}
                  disabled={inFlight}
                  className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border-input)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] transition hover:border-red-500/30 hover:text-red-300 bg-transparent cursor-pointer disabled:cursor-wait disabled:opacity-50"
                >
                  <TrashIcon className="h-3 w-3" />
                  {inFlight ? t('dash.cloud.clearing') : t('dash.cloud.clear_all')}
                </button>
              </div>
            );
          })}
        </div>
      </SectionGroup>
    </div>
  );
}

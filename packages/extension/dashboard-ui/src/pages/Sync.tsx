import { useState } from 'react';
import { t } from '../i18n';
import { post } from '../App';
import type { SyncStatus } from '../types/messages';

const SYNC_PREFS_KEY = 'ava-sync-preferences';

function loadSyncPrefs(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(SYNC_PREFS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveSyncPrefs(prefs: Record<string, boolean>) {
  try { localStorage.setItem(SYNC_PREFS_KEY, JSON.stringify(prefs)); } catch {}
}

function getSyncDataTypes() {
  return [
    { key: 'memory',      label: t('dash.sync.memory'),           icon: '🧠', description: t('dash.sync.memory_desc') },
    { key: 'tasks',       label: t('dash.sync.tasks'),            icon: '✓',  description: t('dash.sync.tasks_desc') },
    { key: 'journal',     label: t('dash.sync.journal'),          icon: '📖', description: t('dash.sync.journal_desc') },
    { key: 'learning',    label: t('dash.nav.learning'),          icon: '🎓', description: t('dash.nav.learning_desc') },
    { key: 'history',     label: t('dash.sync.chat_history'),     icon: '💬', description: t('dash.sync.chat_history_desc') },
    { key: 'settings',    label: t('dash.sync.settings'),         icon: '⚙',  description: t('dash.sync.settings_desc') },
    { key: 'personality', label: t('dash.sync.personality'),       icon: '🎭', description: t('dash.sync.personality_desc') },
    { key: 'learnings',   label: t('dash.sync.shared_learnings'), icon: '💡', description: t('dash.sync.shared_learnings_desc') },
  ] as const;
}

interface Props {
  syncStatus: SyncStatus | null;
  syncingTypes: Set<string>;
  syncResults: Record<string, { success: boolean; count?: number; error?: string }>;
  isConnected: boolean;
}

export function Sync({ syncStatus, syncingTypes, syncResults, isConnected }: Props) {
  const [syncPrefs, setSyncPrefs] = useState<Record<string, boolean>>(loadSyncPrefs);

  const togglePref = (key: string) => {
    setSyncPrefs(prev => {
      const next = { ...prev, [key]: !(prev[key] ?? true) };
      saveSyncPrefs(next);
      return next;
    });
  };

  const isSyncEnabled = (key: string) => syncPrefs[key] ?? (key === 'learnings' ? false : true); // Shared learnings default OFF

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">{t('dash.sync.title')}</h1>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          {t('dash.sync.subtitle')}
        </p>
      </div>

      {!isConnected && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-400 mb-6">
          {t('dash.sync.connect_to_sync')}
        </div>
      )}

      <div className="grid gap-3">
        {getSyncDataTypes().map(({ key, label, icon, description }) => {
          const status = syncStatus?.[key];
          const syncing = syncingTypes.has(key);
          const result = syncResults[key];
          const localCount = status?.localCount ?? 0;
          const syncedCount = status?.syncedCount ?? 0;
          const newCount = status?.newCount ?? localCount;
          const isUpToDate = newCount === 0 && localCount > 0 && status?.lastSynced;
          const lastSynced = status?.lastSynced;

          return (
            <div
              key={key}
              className="flex items-center justify-between rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] px-4 py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                {/* Sync toggle */}
                <button
                  onClick={() => togglePref(key)}
                  className="shrink-0 relative w-8 h-[18px] rounded-full transition-colors duration-200"
                  style={{ background: isSyncEnabled(key) ? 'var(--accent)' : 'var(--bg-input)' }}
                  title={isSyncEnabled(key) ? `Disable ${label} sync` : `Enable ${label} sync`}
                >
                  <div className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all duration-200"
                    style={{ left: isSyncEnabled(key) ? 14 : 2 }}
                  />
                </button>
                <span className="text-lg shrink-0" style={{ opacity: isSyncEnabled(key) ? 1 : 0.3 }}>{icon}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{label}</span>
                    {isUpToDate && (
                      <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                        ✓ Up to date
                      </span>
                    )}
                    {!isUpToDate && newCount > 0 && newCount < localCount && (
                      <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                        {newCount} new since last sync
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] text-[var(--text-muted)] bg-[var(--bg-input)] px-1.5 py-0.5 rounded">
                      Your device: {localCount}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)] bg-[var(--bg-input)] px-1.5 py-0.5 rounded">
                      Cloud: {syncedCount}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] truncate mt-1">
                    {description}
                    {lastSynced && <span className="ml-1 opacity-60">· Last synced {new Date(lastSynced).toLocaleDateString()}</span>}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 ml-4">
                {/* Result indicator */}
                {result && !syncing && (
                  <span className={`text-[11px] ${result.success ? 'text-emerald-400' : 'text-red-400'}`}>
                    {result.success ? `Synced ${result.count ?? 0}` : result.error || 'Failed'}
                  </span>
                )}

                {/* Push button */}
                <button
                  onClick={() => post({ type: 'push_to_cloud', dataType: key as 'memory' | 'tasks' | 'journal' | 'learning' | 'history' | 'settings' | 'personality' | 'learnings' })}
                  disabled={!isConnected || syncing || localCount === 0 || (isUpToDate && !syncing) || !isSyncEnabled(key)}
                  className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {syncing ? (
                    <>
                      <div className="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white" />
                      Pushing...
                    </>
                  ) : isUpToDate ? (
                    <>
                      <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      Synced
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                      </svg>
                      {newCount > 0 && newCount < localCount ? `Push ${newCount} new` : 'Push to Cloud'}
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Push all */}
      {isConnected && (
        <div className="mt-6 flex justify-end">
          <button
            onClick={() => {
              for (const { key } of getSyncDataTypes()) {
                if (!isSyncEnabled(key)) continue; // Skip disabled sections
                const status = syncStatus?.[key];
                if (status && status.localCount > 0) {
                  post({ type: 'push_to_cloud', dataType: key as 'memory' | 'tasks' | 'journal' | 'learning' | 'history' | 'settings' | 'personality' | 'learnings' });
                }
              }
            }}
            disabled={syncingTypes.size > 0}
            className="flex items-center gap-2 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-4 py-2 text-xs font-medium text-[var(--accent)] transition hover:bg-[var(--accent)]/20 disabled:opacity-30"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
            </svg>
            Push All to Cloud
          </button>
        </div>
      )}

      <div className="mt-8 rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] p-4">
        <h3 className="text-xs font-semibold text-white mb-2">How it works</h3>
        <ul className="text-[11px] text-[var(--text-muted)] space-y-1.5">
          <li>All data is saved locally by default — nothing leaves your machine automatically</li>
          <li>Push to Cloud sends your local data to the platform for cross-device access</li>
          <li>Your companion app and web dashboard will show the synced data</li>
          <li>You control what syncs and when — complete privacy by default</li>
        </ul>
      </div>
    </div>
  );
}

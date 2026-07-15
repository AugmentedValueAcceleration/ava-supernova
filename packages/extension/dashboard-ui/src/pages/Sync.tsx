import { useState, useEffect } from 'react';
import { t, tt, useLocale } from '../i18n';
import { post } from '../App';
import { cloudSyncEnabled } from '../lib/data-mode';
import type { SyncStatus, ExtToDashboardMessage } from '../types/messages';
import {
  Brain, CheckSquare, GraduationCap,
  GearSix, MaskHappy, Lightbulb, Heartbeat,
} from '@phosphor-icons/react';

/** Sync categories the host accepts on set_sync_pref / push_to_cloud. */
type SyncDataType =
  | 'memory' | 'tasks' | 'journal' | 'learning' | 'history'
  | 'settings' | 'personality' | 'learnings' | 'health_profile';

function getSyncDataTypes() {
  // Chat history is intentionally absent — it's local-only by design
  // (raw conversations contain the highest-sensitivity content in the
  // product and are never worth shipping to the cloud; Ava's memory
  // extracts the durable facts and syncs those separately). Users who
  // want to wipe conversations uploaded under earlier versions do so
  // via the "Clear cloud data" action on the Privacy page.
  return [
    { key: 'memory',      label: t('dash.sync.memory'),           icon: <Brain weight="duotone" size={18} />, description: t('dash.sync.memory_desc') },
    { key: 'tasks',       label: t('dash.sync.tasks'),            icon: <CheckSquare weight="duotone" size={18} />,  description: t('dash.sync.tasks_desc') },
    // Journal is intentionally absent — it's local-only by design and never
    // syncs to the cloud. Download/transfer is via the Data export page.
    { key: 'learning',    label: t('dash.nav.learning'),          icon: <GraduationCap weight="duotone" size={18} />, description: t('dash.nav.learning_desc') },
    { key: 'settings',    label: t('dash.sync.settings'),         icon: <GearSix weight="duotone" size={18} />,  description: t('dash.sync.settings_desc') },
    { key: 'personality', label: t('dash.sync.personality'),       icon: <MaskHappy weight="duotone" size={18} />, description: t('dash.sync.personality_desc') },
    { key: 'learnings',   label: t('dash.sync.shared_learnings'), icon: <Lightbulb weight="duotone" size={18} />, description: t('dash.sync.shared_learnings_desc') },
    { key: 'health_profile', label: tt('dash.sync.health_profile', 'Health profile'), icon: <Heartbeat weight="duotone" size={18} />, description: tt('dash.sync.health_profile_desc', 'Body stats, goals, constraints and your schedule — what Ava reads for your daily plan') },
  ] as const;
}

interface Props {
  syncStatus: SyncStatus | null;
  syncingTypes: Set<string>;
  syncResults: Record<string, { success: boolean; count?: number; error?: string }>;
  isConnected: boolean;
}

export function Sync({ syncStatus, syncingTypes, syncResults, isConnected }: Props) {
  useLocale();
  const [syncPrefs, setSyncPrefs] = useState<Record<string, boolean>>({});
  // Whole tab is inactive when cloud sync is off — there's nothing to
  // sync. Tracked live so flipping the chat-header toggle activates /
  // deactivates the tab without a reload.
  const [cloudSync, setCloudSync] = useState<boolean>(cloudSyncEnabled());

  // Source of truth lives in the extension host (globalState). Pull on mount
  // and whenever the host pushes an updated set.
  useEffect(() => {
    post({ type: 'load_sync_prefs' });
    const onMessage = (e: MessageEvent<ExtToDashboardMessage>) => {
      if (e.data?.type === 'sync_prefs_loaded') setSyncPrefs(e.data.prefs);
      if (e.data?.type === 'cloud_sync_changed') setCloudSync(e.data.enabled);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Default ON, except the opt-in categories — `learnings` (shares to a
  // global pool) and `health_profile` (most sensitive data; cloud backup
  // is an explicit choice). Mirrors the host's getSyncPrefs defaults.
  const isSyncEnabled = (key: string) => syncPrefs[key] ?? !(key === 'learnings' || key === 'health_profile');

  const togglePref = (key: string) => {
    const next = !isSyncEnabled(key);
    // Optimistic UI; host echoes the authoritative state back via sync_prefs_loaded.
    setSyncPrefs(prev => ({ ...prev, [key]: next }));
    post({ type: 'set_sync_pref', dataType: key as SyncDataType, enabled: next });
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold text-[#cdd6f4]">{t('dash.sync.title')}</h1>
        <p className="text-[13px] text-[#6c7086] mt-1.5">
          {t('dash.sync.subtitle')}
        </p>
      </div>

      {!isConnected && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-400 mb-6">
          {t('dash.sync.connect_to_sync')}
        </div>
      )}

      {isConnected && !cloudSync && (
        <div className="rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] px-4 py-3 text-xs text-[var(--text-muted)] mb-6">
          Cloud sync is off — your data stays on this machine. Turn on the{' '}
          <span className="font-medium text-[#a6e3a1]">{tt('dash.storage.cloud_sync','Cloud sync')}</span> toggle in the chat header to back up to the cloud.
        </div>
      )}

      <div className={`grid gap-3 ${!cloudSync ? 'opacity-40 pointer-events-none select-none' : ''}`}>
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
                    {lastSynced && <span className="ml-1 opacity-60">· Last synced {new Date(lastSynced).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
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
                  onClick={() => post({ type: 'push_to_cloud', dataType: key as SyncDataType })}
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
      {isConnected && cloudSync && (
        <div className="mt-6 flex justify-end">
          <button
            onClick={() => {
              for (const { key } of getSyncDataTypes()) {
                if (!isSyncEnabled(key)) continue; // Skip disabled sections
                const status = syncStatus?.[key];
                if (status && status.localCount > 0) {
                  post({ type: 'push_to_cloud', dataType: key as SyncDataType });
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
        <h3 className="text-xs font-semibold text-white mb-2">{tt('dash.learning.how_it_works','How it works')}</h3>
        <ul className="text-[11px] text-[var(--text-muted)] space-y-1.5">
          <li>{tt('dash.sync.how1','All data is saved locally by default — nothing leaves your machine automatically')}</li>
          <li>{tt('dash.sync.how2','Push to Cloud sends your local data to the platform for cross-device access')}</li>
          <li>{tt('dash.sync.how3','Your companion app and web dashboard will show the synced data')}</li>
          <li>{tt('dash.sync.how4','You control what syncs and when — complete privacy by default')}</li>
        </ul>
      </div>
    </div>
  );
}

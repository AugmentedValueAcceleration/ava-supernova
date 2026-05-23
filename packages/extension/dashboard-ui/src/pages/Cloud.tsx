import { useState } from 'react';
import { t, useLocale } from '../i18n';
import type { SyncStatus, AccountInfo } from '../types/messages';
import { Sync } from './Sync';
import { CloudManagement } from './CloudManagement';

type CloudSubTab = 'sync' | 'management';

interface CloudProps {
  syncStatus: SyncStatus | null;
  syncingTypes: Set<string>;
  syncResults: Record<string, { success: boolean; count?: number; error?: string }>;
  isConnected: boolean;
  account: AccountInfo | null;
}

/** Sync tab — container for two sub-tabs:
 *   1. Sync: per-category toggles + sync status (the existing Sync page).
 *   2. Cloud Management: see what's in cloud storage and manage / delete.
 *
 *  Mirrors the IDE CloudSyncPage. Tab label is "Sync" in the parent
 *  AccountPage; this component still uses "Cloud" as the React identifier
 *  because the inner Sync sub-page is what owns the per-category toggles. */
export function Cloud({
  syncStatus,
  syncingTypes,
  syncResults,
  isConnected,
  account,
}: CloudProps) {
  useLocale();
  const [subTab, setSubTab] = useState<CloudSubTab>('sync');

  return (
    <div className="space-y-4">
      {/* Sub-tab bar */}
      <div className="flex items-center gap-1 border-b border-[var(--border-card)] pb-px">
        <button
          onClick={() => setSubTab('sync')}
          className={`px-3 pb-2 pt-1 text-xs font-medium transition ${
            subTab === 'sync'
              ? 'border-b-2 border-[var(--accent)] text-white'
              : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
          }`}
        >
          {t('dash.nav.sync')}
        </button>
        <button
          onClick={() => setSubTab('management')}
          className={`px-3 pb-2 pt-1 text-xs font-medium transition ${
            subTab === 'management'
              ? 'border-b-2 border-[var(--accent)] text-white'
              : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
          }`}
        >
          {t('dash.cloud.management_tab')}
        </button>
      </div>

      {subTab === 'sync' && (
        <Sync
          syncStatus={syncStatus}
          syncingTypes={syncingTypes}
          syncResults={syncResults}
          isConnected={isConnected}
        />
      )}

      {subTab === 'management' && (
        <CloudManagement account={account} isConnected={isConnected} />
      )}
    </div>
  );
}

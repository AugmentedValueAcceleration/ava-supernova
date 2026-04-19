import { useState } from 'react';
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
  syncDisabled: boolean;
}

/** Cloud page — container for two sub-tabs:
 *   1. Sync: per-category toggles + sync status (the existing Sync page).
 *   2. Cloud Management: see what's in cloud storage and manage / delete.
 *
 *  Replaces the previous flat "Sync" tab. Rename lets us house controls for
 *  cloud content (memories, chats, tasks, journal, creative assets) next to
 *  the sync prefs they relate to. */
export function Cloud({
  syncStatus,
  syncingTypes,
  syncResults,
  isConnected,
  account,
  syncDisabled,
}: CloudProps) {
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
          Sync
        </button>
        <button
          onClick={() => setSubTab('management')}
          className={`px-3 pb-2 pt-1 text-xs font-medium transition ${
            subTab === 'management'
              ? 'border-b-2 border-[var(--accent)] text-white'
              : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
          }`}
        >
          Cloud Management
        </button>
      </div>

      {subTab === 'sync' && (
        <>
          {syncDisabled && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
              Data Mode is set to <span className="font-semibold">Local</span>. Cloud sync runs on whatever you toggle below, but the chat header gates auto-sync on cloud-or-both. Switch the data mode in the chat header to enable background sync.
            </div>
          )}
          <Sync
            syncStatus={syncStatus}
            syncingTypes={syncingTypes}
            syncResults={syncResults}
            isConnected={isConnected}
          />
        </>
      )}

      {subTab === 'management' && (
        <CloudManagement account={account} isConnected={isConnected} />
      )}
    </div>
  );
}

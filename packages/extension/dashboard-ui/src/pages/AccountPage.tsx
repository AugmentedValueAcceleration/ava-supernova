import { useState, useEffect } from 'react';
import { t, useLocale } from '../i18n';
import { Settings } from './Settings';
import { Billing } from './Billing';
import { Connections } from './Connections';
import { Personality } from './Personality';
import { Cloud } from './Cloud';
import type {
  DashboardSettings, ProviderKeyStatus, PersonalityData,
  ConnectionStatus, SyncStatus, Page, AccountInfo,
} from '../types/messages';

type AccountTab = 'settings' | 'billing' | 'connections' | 'personality' | 'cloud';

interface AccountPageProps {
  settings: DashboardSettings;
  onSettingsChange: (s: DashboardSettings) => void;
  providerKeys: ProviderKeyStatus;
  onNavigate?: (page: Page) => void;
  personality?: PersonalityData | null;
  /** Full account object from the platform — powers the Billing tab and
   *  the Cloud Management panel (storage totals, addons). The narrower
   *  {email,name} shape the page historically used wasn't enough for
   *  Cloud Management, so callers now pass the full AccountInfo when
   *  available. Optional: Account page still works signed-out. */
  account?: AccountInfo | null;
  avatarDataUrl?: string;
  connections: ConnectionStatus;
  syncStatus: SyncStatus | null;
  syncingTypes: Set<string>;
  syncResults: Record<string, { success: boolean; count?: number; error?: string }>;
  isPlatform: boolean;
}

function getAccountTabs(): { key: AccountTab; label: string; platformOnly?: boolean }[] {
  return [
    { key: 'settings', label: t('dash.account.tab_settings') },
    { key: 'billing', label: t('dash.account.tab_billing'), platformOnly: true },
    // Connections — hidden until the integrations surface is ready.
    // Component, route, and reducer are all intact; only the tab-bar
    // entry is omitted. Uncomment this line when integrations ship.
    // { key: 'connections', label: t('dash.account.tab_connections') },
    { key: 'personality', label: "Ava's Style" },
    // Renamed from "Sync" — the tab now hosts both the per-category sync
    // prefs AND a Cloud Management view for inspecting / deleting what's
    // synced. "Cloud" is the umbrella; the sub-tabs inside split them.
    { key: 'cloud', label: 'Cloud', platformOnly: true },
  ];
}

export function AccountPage({
  settings, onSettingsChange, providerKeys, onNavigate,
  personality, account, avatarDataUrl,
  connections, syncStatus, syncingTypes, syncResults, isPlatform,
}: AccountPageProps) {
  useLocale();
  const [activeTab, setActiveTab] = useState<AccountTab>('settings');

  // Mirror the chat header's Local/Cloud/Both toggle so Sync can reflect it.
  type DataMode = 'local' | 'cloud' | 'both';
  const [dataMode, setDataMode] = useState<DataMode>(() => (localStorage.getItem('ava-data-mode') as DataMode) || 'local');
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'ava-data-mode' && e.newValue) setDataMode(e.newValue as DataMode);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const syncDisabled = dataMode === 'local';

  const visibleTabs = getAccountTabs().filter(tab => !tab.platformOnly || isPlatform);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-white">Account</h1>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">Settings, billing, connections, and personalisation</p>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-[var(--border-card)] pb-px">
        {visibleTabs.map(({ key, label }) => {
          const isMutedCloud = key === 'cloud' && syncDisabled && activeTab !== 'cloud';
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              title={key === 'cloud' && syncDisabled ? 'Data Mode is set to Local — switch to Cloud or Both in the chat header to enable cloud sync' : undefined}
              className={`px-3 pb-2 pt-1 text-xs font-medium transition ${
                activeTab === key
                  ? 'border-b-2 border-[var(--accent)] text-white'
                  : isMutedCloud
                    ? 'text-[var(--text-muted)] opacity-40 hover:opacity-60'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'settings' && (
        <Settings
          settings={settings}
          onSettingsChange={onSettingsChange}
          providerKeys={providerKeys}
          showProviderKeys
          onNavigate={onNavigate}
          personality={personality}
          account={account}
          avatarDataUrl={avatarDataUrl}
        />
      )}

      {activeTab === 'billing' && account && (
        <Billing account={account} />
      )}

      {activeTab === 'connections' && (
        <Connections connections={connections} />
      )}

      {activeTab === 'personality' && (
        <Personality personality={personality ?? null} />
      )}

      {activeTab === 'cloud' && (
        <Cloud
          syncStatus={syncStatus}
          syncingTypes={syncingTypes}
          syncResults={syncResults}
          isConnected={!!account}
          account={account ?? null}
          syncDisabled={syncDisabled}
        />
      )}
    </div>
  );
}

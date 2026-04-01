import { useState } from 'react';
import { useLocale } from '../i18n';
import { Settings } from './Settings';
import { Billing } from './Billing';
import { Connections } from './Connections';
import { Personality } from './Personality';
import { Sync } from './Sync';
import type {
  DashboardSettings, ProviderKeyStatus, PersonalityData,
  ConnectionStatus, SyncStatus, Page,
} from '../types/messages';

type AccountTab = 'settings' | 'billing' | 'connections' | 'personality' | 'sync';

interface AccountPageProps {
  settings: DashboardSettings;
  onSettingsChange: (s: DashboardSettings) => void;
  providerKeys: ProviderKeyStatus;
  onNavigate?: (page: Page) => void;
  personality?: PersonalityData | null;
  account?: { email?: string; name?: string } | null;
  avatarDataUrl?: string;
  connections: ConnectionStatus;
  syncStatus: SyncStatus | null;
  syncingTypes: Set<string>;
  syncResults: Record<string, { success: boolean; count?: number; error?: string }>;
  isPlatform: boolean;
}

const TABS: { key: AccountTab; label: string; platformOnly?: boolean }[] = [
  { key: 'settings', label: 'Settings' },
  { key: 'billing', label: 'Billing', platformOnly: true },
  { key: 'connections', label: 'Connections' },
  { key: 'personality', label: 'Personality' },
  { key: 'sync', label: 'Sync', platformOnly: true },
];

export function AccountPage({
  settings, onSettingsChange, providerKeys, onNavigate,
  personality, account, avatarDataUrl,
  connections, syncStatus, syncingTypes, syncResults, isPlatform,
}: AccountPageProps) {
  useLocale();
  const [activeTab, setActiveTab] = useState<AccountTab>('settings');

  const visibleTabs = TABS.filter(t => !t.platformOnly || isPlatform);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-white">Account</h1>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">Settings, billing, connections, and personalisation</p>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-[var(--border-card)] pb-px">
        {visibleTabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-3 pb-2 pt-1 text-xs font-medium transition ${
              activeTab === key
                ? 'border-b-2 border-[var(--accent)] text-white'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {label}
          </button>
        ))}
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

      {activeTab === 'sync' && (
        <Sync
          syncStatus={syncStatus}
          syncingTypes={syncingTypes}
          syncResults={syncResults}
          isConnected={!!account}
        />
      )}
    </div>
  );
}

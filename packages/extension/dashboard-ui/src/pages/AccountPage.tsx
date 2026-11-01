import { useState } from 'react';
import { t, tt, useLocale } from '../i18n';
import { Settings } from './Settings';
import { Connections } from './Connections';
import { Personality } from './Personality';
import { GeneralProfilePage } from './GeneralProfilePage';
import type {
  DashboardSettings, ProviderKeyStatus, PersonalityData,
  ConnectionStatus, Page,
  GeneralProfile,
} from '../types/messages';

type AccountTab = 'settings' | 'connections' | 'personality' | 'profile';

/** "{name}'s profile" holds what is genuinely ACCOUNT-shaped: who you are.
 *  Name, picture, body basics — reusable well beyond health.
 *
 *  The health profile and plans moved OUT to Nutrition & Fitness on 2026-07-28.
 *  My Submissions was removed on 2026-08-10; the avatar moved IN from "Ava's
 *  Style" the same day, since it renders beside your email in the nav and was
 *  never hers. */

interface AccountPageProps {
  settings: DashboardSettings;
  onSettingsChange: (s: DashboardSettings) => void;
  providerKeys: ProviderKeyStatus;
  onNavigate?: (page: Page) => void;
  personality?: PersonalityData | null;
  avatarDataUrl?: string;
  connections: ConnectionStatus;
  // "Your profile" tab — identity, picture and body basics.
  generalProfile: GeneralProfile | null;
  onSaveGeneralProfile: (next: GeneralProfile) => void;
}

function getAccountTabs(name?: string | null): { key: AccountTab; label: string }[] {
  const firstName = name?.trim().split(/\s+/)[0];
  return [
    { key: 'settings', label: tt('dash.account.tab_settings', 'Settings') },
    // Connections tab hidden for now — being reworked later this week.
    // Re-enable by restoring: { key: 'connections', label: tt('dash.account.tab_connections', 'Connections') },
    { key: 'personality', label: tt('dash.account.tab_personality', "Ava's Style") },
    { key: 'profile', label: firstName ? t('general.profile.account_tab_named', { name: firstName }) : t('general.profile.account_tab') },
  ];
}

export function AccountPage({
  settings, onSettingsChange, providerKeys,
  personality, avatarDataUrl,
  connections,
  generalProfile, onSaveGeneralProfile,
}: AccountPageProps) {
  useLocale();
  const [activeTab, setActiveTab] = useState<AccountTab>('settings');

  const visibleTabs = getAccountTabs(generalProfile?.display_name);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-semibold text-[#cdd6f4]">{tt('dash.account.title', 'Account')}</h1>
        <p className="mt-1.5 text-[13px] text-[#6c7086]">{tt('dash.account.subtitle', 'Settings, connections, and personalisation')}</p>
      </div>

      {/* Tab bar — matches IDE AccountPage at DashboardPages.tsx:12910-12919. */}
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
        />
      )}

      {activeTab === 'connections' && (
        <Connections connections={connections} />
      )}

      {activeTab === 'personality' && (
        <Personality personality={personality ?? null} />
      )}

      {/* One thing lives here now, so there is no tab strip: a row of tabs with
          a single tab is furniture, not navigation. */}
      {activeTab === 'profile' && (
        <GeneralProfilePage
          profile={generalProfile}
          avatarDataUrl={avatarDataUrl}
          onSave={onSaveGeneralProfile}
        />
      )}
    </div>
  );
}

import { useState } from 'react';
import { tt, useLocale } from '../i18n';
import { Settings } from './Settings';
import { Personality } from './Personality';
import type {
  DashboardSettings, ProviderKeyStatus, PersonalityData,
  Page,
} from '../types/messages';

type AccountTab = 'settings' | 'personality';

/** The profile tab moved to its own sidebar page on 2026-11-28 (plan
 *  2026-11-27-profile-index); the history below is kept for context.
 *  "{name}'s profile" held what is genuinely ACCOUNT-shaped: who you are.
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
}

function getAccountTabs(): { key: AccountTab; label: string }[] {
  return [
    { key: 'settings', label: tt('dash.account.tab_settings', 'Settings') },
    { key: 'personality', label: tt('dash.account.tab_personality', "Ava's Style") },
  ];
}

export function AccountPage({
  settings, onSettingsChange, providerKeys,
  personality,
}: AccountPageProps) {
  useLocale();
  const [activeTab, setActiveTab] = useState<AccountTab>('settings');

  const visibleTabs = getAccountTabs();

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

      {activeTab === 'personality' && (
        <Personality personality={personality ?? null} />
      )}

    </div>
  );
}

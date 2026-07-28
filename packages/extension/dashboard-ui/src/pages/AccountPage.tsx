import { useState, useEffect, type ComponentProps } from 'react';
import { t, tt, useLocale } from '../i18n';
import { Settings } from './Settings';
import { Billing } from './Billing';
import { Connections } from './Connections';
import { Personality } from './Personality';
import { GeneralProfilePage } from './GeneralProfilePage';
import { HealthMySubmissions } from './HealthMySubmissions';
import { HealthSubmissionModal } from './HealthSubmissionModal';
import type {
  DashboardSettings, ProviderKeyStatus, PersonalityData,
  ConnectionStatus, Page, AccountInfo,
  GeneralProfile,
} from '../types/messages';

type AccountTab = 'settings' | 'billing' | 'connections' | 'personality' | 'profile';
type ProfileSubTab = 'general' | 'submissions';

/** The user's own data lives under "{name}'s profile": identity + body, and
 *  their catalogue contributions.
 *
 *  The health profile and plans moved OUT to Nutrition & Fitness on 2026-07-28,
 *  reversing the 2026-06-21 consolidation. That move kept the library page lean
 *  but filed the health profile — which every generated plan is built from — in
 *  account settings, where it went unfilled. What stays here is what is
 *  genuinely account-shaped: the general profile (reused beyond health) and
 *  submissions (a contribution concern). */
type HealthSubmissionsBundle =
  Omit<ComponentProps<typeof HealthMySubmissions>, 'onContribute'> &
  Omit<ComponentProps<typeof HealthSubmissionModal>, 'open' | 'onClose'>;

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
  isPlatform: boolean;
  // "Your profile" tab — General (identity/body) + Health Profile sub-tabs.
  generalProfile: GeneralProfile | null;
  onSaveGeneralProfile: (next: GeneralProfile) => void;
  /** Taxonomies for the submission pickers ride along INSIDE this bundle
   *  (.taxonomies / .onRetryTaxonomies) — no separate props needed. */
  healthSubmissions: HealthSubmissionsBundle;
  /** When set, the profile tab opens on this sub-tab (deep-link from Health). */
  profileInitialSubTab?: ProfileSubTab | null;
  onConsumeProfileInitialSubTab?: () => void;
}

// Sync tab removed — Ava is local-first; nothing syncs to the cloud (storage
// sunsets 1 Jul 2026). Connections shows always; Billing gates on platform.
function getAccountTabs(name?: string | null): { key: AccountTab; label: string; platformOnly?: boolean }[] {
  const firstName = name?.trim().split(/\s+/)[0];
  return [
    { key: 'settings', label: tt('dash.account.tab_settings', 'Settings') },
    { key: 'billing', label: tt('dash.account.tab_billing', 'Billing'), platformOnly: true },
    // Connections tab hidden for now — being reworked later this week.
    // Re-enable by restoring: { key: 'connections', label: tt('dash.account.tab_connections', 'Connections') },
    { key: 'personality', label: tt('dash.account.tab_personality', "Ava's Style") },
    { key: 'profile', label: firstName ? t('general.profile.account_tab_named', { name: firstName }) : t('general.profile.account_tab') },
  ];
}

export function AccountPage({
  settings, onSettingsChange, providerKeys,
  personality, account, avatarDataUrl,
  connections, isPlatform,
  generalProfile, onSaveGeneralProfile,
  healthSubmissions,
  profileInitialSubTab, onConsumeProfileInitialSubTab,
}: AccountPageProps) {
  useLocale();
  const [activeTab, setActiveTab] = useState<AccountTab>(profileInitialSubTab ? 'profile' : 'settings');
  const [profileSubTab, setProfileSubTab] = useState<ProfileSubTab>(profileInitialSubTab ?? 'general');
  const [submissionModalOpen, setSubmissionModalOpen] = useState(false);

  // Deep-link from Health & Nutrition ("Edit profile →") lands here on the
  // requested sub-tab. Consumed once so a later plain visit lands on General.
  useEffect(() => {
    if (profileInitialSubTab) {
      setActiveTab('profile');
      setProfileSubTab(profileInitialSubTab);
      onConsumeProfileInitialSubTab?.();
    }
  }, [profileInitialSubTab, onConsumeProfileInitialSubTab]);

  const visibleTabs = getAccountTabs(account?.name).filter(tab => !tab.platformOnly || isPlatform);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-semibold text-[#cdd6f4]">{tt('dash.account.title', 'Account')}</h1>
        <p className="mt-1.5 text-[13px] text-[#6c7086]">{tt('dash.account.subtitle', 'Settings, billing, connections, and personalisation')}</p>
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
          account={account}
        />
      )}

      {activeTab === 'billing' && (
        <Billing account={account ?? null} />
      )}

      {activeTab === 'connections' && (
        <Connections connections={connections} />
      )}

      {activeTab === 'personality' && (
        <Personality personality={personality ?? null} avatarDataUrl={avatarDataUrl} account={account} />
      )}

      {activeTab === 'profile' && (
        <div className="space-y-4">
          {/* Inner sub-tabs: General (identity/body) + My submissions. */}
          <div className="flex items-center gap-1 border-b border-[var(--border-card)] pb-px">
            {([
              { key: 'general' as const, label: t('general.profile.tab') },
              { key: 'submissions' as const, label: t('health.browse.tab.mine') },
            ]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setProfileSubTab(key)}
                className={`px-3 pb-2 pt-1 text-xs font-medium transition ${
                  profileSubTab === key
                    ? 'border-b-2 border-[var(--accent)] text-white'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {profileSubTab === 'general' && (
            <GeneralProfilePage
              profile={generalProfile}
              accountName={account?.name ?? null}
              onSave={onSaveGeneralProfile}
            />
          )}
          {profileSubTab === 'submissions' && (
            <>
              <HealthMySubmissions {...healthSubmissions} onContribute={() => setSubmissionModalOpen(true)} />
              <HealthSubmissionModal
                {...healthSubmissions}
                open={submissionModalOpen}
                onClose={() => { setSubmissionModalOpen(false); healthSubmissions.onClearDraft(); }}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
